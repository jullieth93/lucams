/*
 * Tests del RBAC del admin por rol (lógica pura, client-safe).
 * Cubre la matriz completa rol × ruta de canAccessAdminPath y el filtrado
 * de menú de filterNavByRole. Ver fuente: lib/admin-rbac.ts + SECURITY.md §113-118.
 */
import { describe, expect, it } from "vitest";
import type { AdminRole } from "@lucams/db";
import { canAccessAdminPath, filterNavByRole } from "./admin-rbac";

// Rutas representativas por categoría (derivadas de ROUTE_ROLES en la fuente).
const CATALOG_PATHS = [
  "/admin/productos",
  "/admin/inventario",
  "/admin/categorias",
  "/admin/ocasiones",
  "/admin/resenas",
  "/admin/clientes",
];
// "Reclamos" son las rutas reales garantias + retractos (todos los roles operativos).
const SHARED_PATHS = [
  "/admin/dashboard",
  "/admin/pedidos",
  "/admin/garantias",
  "/admin/retractos",
];
// Rutas NO listadas → deny-by-default (solo SUPERADMIN).
const SUPERADMIN_ONLY_PATHS = [
  "/admin/finanzas",
  "/admin/cupones",
  "/admin/usuarios",
  "/admin/integraciones",
  "/admin/contenido",
  "/admin/auditoria",
  "/admin/seguridad",
  "/admin/mayorista",
  "/admin/materiales",
  "/admin/costos",
  "/admin/canales",
  "/admin/bot",
  "/admin/metricas",
  "/admin/performance",
  "/admin/redirects",
  "/admin/email-templates",
];

describe("canAccessAdminPath — SUPERADMIN", () => {
  it("permite acceso a TODAS las rutas listadas", () => {
    for (const p of [...SHARED_PATHS, ...CATALOG_PATHS, ...SUPERADMIN_ONLY_PATHS]) {
      expect(canAccessAdminPath("SUPERADMIN", p)).toBe(true);
    }
  });

  it("permite acceso incluso a rutas inexistentes / arbitrarias", () => {
    expect(canAccessAdminPath("SUPERADMIN", "/admin/ruta-que-no-existe")).toBe(true);
    expect(canAccessAdminPath("SUPERADMIN", "/")).toBe(true);
    expect(canAccessAdminPath("SUPERADMIN", "")).toBe(true);
    expect(canAccessAdminPath("SUPERADMIN", "/cualquier/cosa")).toBe(true);
  });
});

describe("canAccessAdminPath — MANAGER", () => {
  it("permite catálogo (productos/inventario/categorias/ocasiones/resenas/clientes)", () => {
    for (const p of CATALOG_PATHS) {
      expect(canAccessAdminPath("MANAGER", p)).toBe(true);
    }
  });

  it("permite pedidos, garantías y dashboard (compartidas con todos)", () => {
    for (const p of SHARED_PATHS) {
      expect(canAccessAdminPath("MANAGER", p)).toBe(true);
    }
  });

  it("NIEGA finanzas, usuarios y seguridad (deny-by-default)", () => {
    expect(canAccessAdminPath("MANAGER", "/admin/finanzas")).toBe(false);
    expect(canAccessAdminPath("MANAGER", "/admin/usuarios")).toBe(false);
    expect(canAccessAdminPath("MANAGER", "/admin/seguridad")).toBe(false);
  });

  it("NIEGA toda ruta no listada", () => {
    for (const p of SUPERADMIN_ONLY_PATHS) {
      expect(canAccessAdminPath("MANAGER", p)).toBe(false);
    }
  });
});

describe("canAccessAdminPath — FULFILLMENT", () => {
  it("permite SOLO pedidos, garantías y dashboard", () => {
    for (const p of SHARED_PATHS) {
      expect(canAccessAdminPath("FULFILLMENT", p)).toBe(true);
    }
  });

  it("NIEGA todo el catálogo (incluye reseñas y clientes)", () => {
    for (const p of CATALOG_PATHS) {
      expect(canAccessAdminPath("FULFILLMENT", p)).toBe(false);
    }
  });

  it("NIEGA toda ruta no listada (finanzas/usuarios/seguridad/etc.)", () => {
    for (const p of SUPERADMIN_ONLY_PATHS) {
      expect(canAccessAdminPath("FULFILLMENT", p)).toBe(false);
    }
  });
});

describe("canAccessAdminPath — matriz completa rol × ruta representativa", () => {
  // [ruta, SUPERADMIN, MANAGER, FULFILLMENT]
  const matrix: Array<[string, boolean, boolean, boolean]> = [
    ["/admin/dashboard", true, true, true],
    ["/admin/pedidos", true, true, true],
    ["/admin/garantias", true, true, true],
    ["/admin/retractos", true, true, true],
    ["/admin/soporte", true, true, false],
    ["/admin/productos", true, true, false],
    ["/admin/inventario", true, true, false],
    ["/admin/categorias", true, true, false],
    ["/admin/ocasiones", true, true, false],
    ["/admin/resenas", true, true, false],
    ["/admin/clientes", true, true, false],
    ["/admin/finanzas", true, false, false],
    ["/admin/usuarios", true, false, false],
    ["/admin/seguridad", true, false, false],
    ["/admin/cupones", true, false, false],
    ["/admin/auditoria", true, false, false],
  ];

  it.each(matrix)(
    "%s → SA=%s MGR=%s FUL=%s",
    (path, sa, mgr, ful) => {
      expect(canAccessAdminPath("SUPERADMIN", path)).toBe(sa);
      expect(canAccessAdminPath("MANAGER", path)).toBe(mgr);
      expect(canAccessAdminPath("FULFILLMENT", path)).toBe(ful);
    },
  );
});

describe("canAccessAdminPath — coincidencia de prefijo (subrutas)", () => {
  it("coincide en subruta con '/' (ej. detalle de pedido)", () => {
    expect(canAccessAdminPath("MANAGER", "/admin/pedidos/123")).toBe(true);
    expect(canAccessAdminPath("FULFILLMENT", "/admin/pedidos/123")).toBe(true);
    expect(canAccessAdminPath("MANAGER", "/admin/productos/abc/editar")).toBe(true);
    expect(canAccessAdminPath("FULFILLMENT", "/admin/productos/abc/editar")).toBe(false);
  });

  it("coincide con query string ('?')", () => {
    expect(canAccessAdminPath("MANAGER", "/admin/pedidos?estado=PAID")).toBe(true);
    expect(canAccessAdminPath("FULFILLMENT", "/admin/productos?page=2")).toBe(false);
    // Catálogo con query para MANAGER (permitido) y FULFILLMENT (negado).
    expect(canAccessAdminPath("MANAGER", "/admin/clientes?q=lucy")).toBe(true);
    expect(canAccessAdminPath("FULFILLMENT", "/admin/clientes?q=lucy")).toBe(false);
  });

  it("coincide exactamente con el prefijo (sin sufijo)", () => {
    expect(canAccessAdminPath("MANAGER", "/admin/categorias")).toBe(true);
  });
});

describe("canAccessAdminPath — bordes y entradas que NO deben coincidir", () => {
  it("NO trata un prefijo parcial de segmento como match (seguridad)", () => {
    // '/admin/pedidosX' NO debe heredar permisos de '/admin/pedidos'.
    expect(canAccessAdminPath("FULFILLMENT", "/admin/pedidosX")).toBe(false);
    expect(canAccessAdminPath("MANAGER", "/admin/pedidos-archivados")).toBe(false);
    expect(canAccessAdminPath("FULFILLMENT", "/admin/garantias2")).toBe(false);
    expect(canAccessAdminPath("MANAGER", "/admin/productosX")).toBe(false);
  });

  it("NIEGA prefijos cortados o ascendentes para roles no-SUPERADMIN", () => {
    expect(canAccessAdminPath("MANAGER", "/admin")).toBe(false);
    expect(canAccessAdminPath("FULFILLMENT", "/admin/")).toBe(false);
    expect(canAccessAdminPath("MANAGER", "/")).toBe(false);
    expect(canAccessAdminPath("FULFILLMENT", "")).toBe(false);
  });

  it("es case-sensitive en la ruta (no coincide con mayúsculas)", () => {
    expect(canAccessAdminPath("MANAGER", "/admin/PEDIDOS")).toBe(false);
    expect(canAccessAdminPath("FULFILLMENT", "/Admin/pedidos")).toBe(false);
  });

  it("NIEGA rutas fuera del namespace /admin para roles no-SUPERADMIN", () => {
    expect(canAccessAdminPath("MANAGER", "/checkout")).toBe(false);
    expect(canAccessAdminPath("FULFILLMENT", "/productos/imanes")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterNavByRole
// ---------------------------------------------------------------------------

type NavItem = { label: string; href: string };
type NavGroup = { label: string; href?: string; items?: NavItem[] };

function buildNav(): NavGroup[] {
  return [
    // Link directo (sin items).
    { label: "Dashboard", href: "/admin/dashboard" },
    // Grupo mixto: pedidos+garantías (todos) y catálogo (solo manager).
    {
      label: "Operación",
      items: [
        { label: "Pedidos", href: "/admin/pedidos" },
        { label: "Garantías", href: "/admin/garantias" },
        { label: "Productos", href: "/admin/productos" },
        { label: "Clientes", href: "/admin/clientes" },
      ],
    },
    // Grupo 100% catálogo: desaparece para FULFILLMENT.
    {
      label: "Catálogo",
      items: [
        { label: "Inventario", href: "/admin/inventario" },
        { label: "Categorías", href: "/admin/categorias" },
        { label: "Reseñas", href: "/admin/resenas" },
      ],
    },
    // Grupo 100% superadmin: desaparece para MANAGER y FULFILLMENT.
    {
      label: "Sistema",
      items: [
        { label: "Finanzas", href: "/admin/finanzas" },
        { label: "Usuarios", href: "/admin/usuarios" },
        { label: "Seguridad", href: "/admin/seguridad" },
      ],
    },
    // Link directo solo-superadmin.
    { label: "Auditoría", href: "/admin/auditoria" },
  ];
}

describe("filterNavByRole — SUPERADMIN", () => {
  it("devuelve la MISMA referencia de array sin modificar (pasa-through)", () => {
    const nav = buildNav();
    const out = filterNavByRole(nav, "SUPERADMIN");
    expect(out).toBe(nav); // misma referencia, no copia
    expect(out).toHaveLength(5);
  });
});

describe("filterNavByRole — MANAGER", () => {
  it("conserva dashboard, operación (con catálogo), catálogo; descarta Sistema y Auditoría", () => {
    const out = filterNavByRole(buildNav(), "MANAGER");
    const labels = out.map((g) => g.label);
    expect(labels).toEqual(["Dashboard", "Operación", "Catálogo"]);
  });

  it("mantiene los 4 items de Operación (todos visibles para MANAGER)", () => {
    const out = filterNavByRole(buildNav(), "MANAGER");
    const operacion = out.find((g) => g.label === "Operación");
    expect(operacion?.items?.map((i) => i.href)).toEqual([
      "/admin/pedidos",
      "/admin/garantias",
      "/admin/productos",
      "/admin/clientes",
    ]);
  });

  it("no muta el array ni los grupos originales (clona el grupo filtrado)", () => {
    const nav = buildNav();
    const operacionOriginal = nav[1];
    const itemsOriginalRef = operacionOriginal.items;
    const out = filterNavByRole(nav, "MANAGER");
    // El array de salida es nuevo.
    expect(out).not.toBe(nav);
    // El grupo original conserva sus items intactos.
    expect(operacionOriginal.items).toBe(itemsOriginalRef);
    expect(operacionOriginal.items).toHaveLength(4);
  });
});

describe("filterNavByRole — FULFILLMENT", () => {
  it("conserva solo dashboard y operación (con pedidos+garantías), descarta lo demás", () => {
    const out = filterNavByRole(buildNav(), "FULFILLMENT");
    expect(out.map((g) => g.label)).toEqual(["Dashboard", "Operación"]);
  });

  it("filtra Operación a SOLO pedidos y garantías (sin catálogo)", () => {
    const out = filterNavByRole(buildNav(), "FULFILLMENT");
    const operacion = out.find((g) => g.label === "Operación");
    expect(operacion?.items?.map((i) => i.href)).toEqual([
      "/admin/pedidos",
      "/admin/garantias",
    ]);
  });

  it("descarta el grupo Catálogo completo (queda vacío)", () => {
    const out = filterNavByRole(buildNav(), "FULFILLMENT");
    expect(out.find((g) => g.label === "Catálogo")).toBeUndefined();
  });

  it("descarta el grupo Sistema completo (seguridad/finanzas/usuarios)", () => {
    const out = filterNavByRole(buildNav(), "FULFILLMENT");
    expect(out.find((g) => g.label === "Sistema")).toBeUndefined();
  });
});

describe("filterNavByRole — bordes estructurales", () => {
  it("array vacío → array vacío para cualquier rol", () => {
    expect(filterNavByRole([], "MANAGER")).toEqual([]);
    expect(filterNavByRole([], "FULFILLMENT")).toEqual([]);
    expect(filterNavByRole([], "SUPERADMIN")).toEqual([]);
  });

  it("DESCARTA grupo con items=[] (un grupo de lista sin items visibles no se muestra)", () => {
    // Un grupo que declara `items` pero queda vacío (o `items: []`) no debe
    // renderizar un dropdown vacío → se descarta. (Los grupos estructurales sin
    // `items` ni `href` sí se conservan — ver test siguiente.)
    const nav: NavGroup[] = [{ label: "Vacío", items: [] }];
    const out = filterNavByRole(nav, "MANAGER");
    expect(out).toHaveLength(0);
  });

  it("conserva grupo sin items NI href (else-branch incondicional) para roles no-SA", () => {
    // Un grupo separador/encabezado sin href ni items se mantiene.
    const nav: NavGroup[] = [{ label: "Separador" }];
    const out = filterNavByRole(nav, "FULFILLMENT");
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Separador");
  });

  it("descarta link directo (href) inaccesible para el rol", () => {
    const nav: NavGroup[] = [
      { label: "Finanzas", href: "/admin/finanzas" }, // solo SA
      { label: "Pedidos", href: "/admin/pedidos" }, // todos
    ];
    const mgr = filterNavByRole(nav, "MANAGER");
    expect(mgr.map((g) => g.label)).toEqual(["Pedidos"]);
    const ful = filterNavByRole(nav, "FULFILLMENT");
    expect(ful.map((g) => g.label)).toEqual(["Pedidos"]);
  });

  it("prioriza items sobre href cuando ambos existen (rama items gana)", () => {
    // La fuente evalúa `if (g.items && g.items.length > 0)` ANTES que href.
    // Un grupo con href de SA pero items accesibles se conserva por sus items.
    const nav: NavGroup[] = [
      {
        label: "Híbrido",
        href: "/admin/finanzas", // href solo-SA, pero NO se usa porque hay items
        items: [{ label: "Pedidos", href: "/admin/pedidos" }],
      },
    ];
    const out = filterNavByRole(nav, "FULFILLMENT");
    expect(out).toHaveLength(1);
    expect(out[0].items?.map((i) => i.href)).toEqual(["/admin/pedidos"]);
  });
});

describe("integridad de tipos (sanity de roles del enum AdminRole)", () => {
  it("los tres roles del enum se comportan de forma determinista", () => {
    const roles: AdminRole[] = ["SUPERADMIN", "MANAGER", "FULFILLMENT"];
    for (const role of roles) {
      // pedidos: accesible para los tres.
      expect(canAccessAdminPath(role, "/admin/pedidos")).toBe(true);
      // seguridad: solo SUPERADMIN.
      expect(canAccessAdminPath(role, "/admin/seguridad")).toBe(
        role === "SUPERADMIN",
      );
    }
  });
});
