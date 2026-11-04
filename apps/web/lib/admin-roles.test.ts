import { describe, expect, it } from "vitest";
import {
  ADMIN_ROLES_ALL,
  ADMIN_ROLE_DESCRIPTION,
  ADMIN_ROLE_LABEL,
  adminRoleLabel,
  isValidAdminRole,
} from "./admin-roles";

/**
 * Roles reales del enum Prisma `AdminRole` (packages/db/prisma/schema.prisma):
 *   SUPERADMIN | OPERATIONS_MANAGER | CUSTOMER_SUPPORT | PRINT_WORKSHOP |
 *   FINANCE_ANALYST | MANAGER | FULFILLMENT | CMS_EDITOR
 */
const ADMIN_ROLE_ENUM = [
  "SUPERADMIN",
  "OPERATIONS_MANAGER",
  "CUSTOMER_SUPPORT",
  "PRINT_WORKSHOP",
  "FINANCE_ANALYST",
  "MANAGER",
  "FULFILLMENT",
  "CMS_EDITOR",
] as const;

describe("ADMIN_ROLE_LABEL (diccionario)", () => {
  it("mapea cada rol del enum a su label en español", () => {
    expect(ADMIN_ROLE_LABEL.SUPERADMIN).toBe("Administradora");
    expect(ADMIN_ROLE_LABEL.OPERATIONS_MANAGER).toBe("Jefa de operaciones");
    expect(ADMIN_ROLE_LABEL.CUSTOMER_SUPPORT).toBe("Atención al cliente");
    expect(ADMIN_ROLE_LABEL.PRINT_WORKSHOP).toBe("Taller e impresión");
    expect(ADMIN_ROLE_LABEL.FINANCE_ANALYST).toBe("Analista financiera");
    expect(ADMIN_ROLE_LABEL.MANAGER).toBe("Gestora");
    expect(ADMIN_ROLE_LABEL.FULFILLMENT).toBe("Despachos");
    expect(ADMIN_ROLE_LABEL.CMS_EDITOR).toBe("Editor de contenido");
  });

  it("cubre exactamente los valores del enum AdminRole — ni más ni menos", () => {
    expect([...ADMIN_ROLES_ALL].sort()).toEqual([...ADMIN_ROLE_ENUM].sort());
    for (const role of ADMIN_ROLE_ENUM) {
      expect(ADMIN_ROLE_LABEL).toHaveProperty(role);
      expect(ADMIN_ROLE_DESCRIPTION[role].trim().length).toBeGreaterThan(10);
      expect(isValidAdminRole(role)).toBe(true);
    }
    expect(Object.keys(ADMIN_ROLE_LABEL).sort()).toEqual([...ADMIN_ROLE_ENUM].sort());
    expect(isValidAdminRole("ADMIN")).toBe(false);
    expect(isValidAdminRole("")).toBe(false);
  });

  it("no resucita los valores de enum inexistentes que el módulo dice haber eliminado", () => {
    // El docblock menciona que ADMIN/EDITOR/OPERATOR eran valores fantasma.
    expect(ADMIN_ROLE_LABEL).not.toHaveProperty("ADMIN");
    expect(ADMIN_ROLE_LABEL).not.toHaveProperty("EDITOR");
    expect(ADMIN_ROLE_LABEL).not.toHaveProperty("OPERATOR");
  });

  it("usa labels en femenino/español-CO no vacíos y sin duplicados", () => {
    const labels = Object.values(ADMIN_ROLE_LABEL);
    for (const label of labels) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
    // Cada rol debe ser distinguible en la UI: labels únicos.
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("adminRoleLabel — roles conocidos", () => {
  it.each([
    ["SUPERADMIN", "Administradora"],
    ["MANAGER", "Gestora"],
    ["FULFILLMENT", "Despachos"],
    ["CMS_EDITOR", "Editor de contenido"],
  ])("traduce %s -> %s", (role, expected) => {
    expect(adminRoleLabel(role)).toBe(expected);
  });

  it("devuelve exactamente el mismo string que el diccionario para cada rol", () => {
    for (const role of ADMIN_ROLE_ENUM) {
      expect(adminRoleLabel(role)).toBe(ADMIN_ROLE_LABEL[role]);
    }
  });
});

describe("adminRoleLabel — fallback (rol desconocido)", () => {
  it("devuelve el rol crudo cuando no está en el diccionario", () => {
    expect(adminRoleLabel("UNKNOWN")).toBe("UNKNOWN");
    expect(adminRoleLabel("CUSTOMER")).toBe("CUSTOMER");
    expect(adminRoleLabel("GUEST")).toBe("GUEST");
  });

  it("es case-sensitive: lowercase/variantes no matchean y caen al fallback", () => {
    expect(adminRoleLabel("superadmin")).toBe("superadmin");
    expect(adminRoleLabel("Manager")).toBe("Manager");
    expect(adminRoleLabel("FULFILLMENT ")).toBe("FULFILLMENT "); // espacio final
    expect(adminRoleLabel(" SUPERADMIN")).toBe(" SUPERADMIN"); // espacio inicial
  });

  it("no recorta ni normaliza espacios", () => {
    expect(adminRoleLabel("  MANAGER  ")).toBe("  MANAGER  ");
  });

  it("devuelve el string vacío tal cual (no hay label para '')", () => {
    expect(adminRoleLabel("")).toBe("");
  });

  it("no muta el diccionario al consultar un rol desconocido", () => {
    const before = { ...ADMIN_ROLE_LABEL };
    adminRoleLabel("ALGO_RARO");
    expect(ADMIN_ROLE_LABEL).toEqual(before);
    expect(ADMIN_ROLE_LABEL).not.toHaveProperty("ALGO_RARO");
  });
});

/**
 * Seguridad / robustez: el diccionario es un objeto plano, así que las claves
 * heredadas de Object.prototype son accesibles vía `ADMIN_ROLE_LABEL[key]`.
 * El lookup usa Object.hasOwn, así que claves heredadas del prototype devuelven
 * el string de entrada (no la propiedad heredada) — el retorno SIEMPRE es string.
 * (Bug corregido tras hallarlo con estos tests, Lucy 2026-06-30.)
 */
describe("adminRoleLabel — claves del prototype devuelven el string de entrada", () => {
  it.each(["toString", "__proto__", "constructor", "hasOwnProperty", "valueOf", "isPrototypeOf"])(
    "'%s' devuelve el string de entrada (no la propiedad heredada)",
    (key) => {
      const out = adminRoleLabel(key);
      expect(typeof out).toBe("string");
      expect(out).toBe(key);
    },
  );
});

describe("adminRoleLabel — pureza / sin efectos colaterales", () => {
  it("es determinista: misma entrada -> misma salida en llamadas repetidas", () => {
    expect(adminRoleLabel("SUPERADMIN")).toBe(adminRoleLabel("SUPERADMIN"));
    expect(adminRoleLabel("X")).toBe(adminRoleLabel("X"));
  });

  it("no escribe en el diccionario al traducir roles conocidos", () => {
    const snapshot = JSON.stringify(ADMIN_ROLE_LABEL);
    for (const role of ADMIN_ROLE_ENUM) adminRoleLabel(role);
    expect(JSON.stringify(ADMIN_ROLE_LABEL)).toBe(snapshot);
  });
});
