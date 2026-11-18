/*
 * Tests del RBAC del admin por rol (lógica pura, client-safe).
 * Cubre la matriz completa rol × ruta de canAccessAdminPath y el filtrado
 * de menú de filterNavByRole. Ver fuente: lib/admin-rbac.ts + SECURITY.md §113-118.
 *
 * Auditoría 2026-08-24 · B-1: /admin/seguridad quedó ABIERTA a los cuatro roles
 * (MFA obligatorio para todo admin → la pantalla de enrolamiento/autoservicio
 * no puede vivir tras el deny-by-default).
 */
import { describe, expect, it } from "vitest";
import type { AdminRole } from "@lucams/db";
import {
  ADMIN_CAPABILITIES,
  ADMIN_ROLE_SETS,
  canAccessAdminPath,
  canFilterOrdersByPaymentMethod,
  canManageOrderRenderJobs,
  canRetryOrderShipment,
  canSeeOrderCodCollectionAmount,
  canSeeOrderCommercialBreakdown,
  canSeeOrderTotalInGuide,
  canTransitionOrderTo,
  filterNavByRole,
  getNotificationRouteScope,
  adminHomePath,
  hasCapability,
  rolesWithCapability,
} from "./admin-rbac";
import { maskBlockedIdentityValue } from "./pii-mask";

// Rutas representativas por categoría (derivadas de ROUTE_ROLES en la fuente).
const CATALOG_PATHS = [
  "/admin/productos",
  "/admin/inventario",
  "/admin/materiales",
  "/admin/costos",
  "/admin/mayorista",
  "/admin/cupones",
  "/admin/categorias",
  "/admin/ocasiones",
  "/admin/resenas",
  "/admin/clientes",
  "/admin/canales",
  "/admin/canales/tienda",
  "/admin/envios",
];
// Compartidas por los tres roles operativos (N-21, 2026-09-11: garantías y
// retractos ya NO están acá — la ruta replica lo que su página exige).
const SHARED_PATHS = ["/admin/dashboard", "/admin/pedidos"];
// Garantías, Retractos y Notificaciones: SUPER+MANAGER/OPERATIONS_MANAGER.
const MANAGER_UP_PATHS = ["/admin/garantias", "/admin/retractos", "/admin/notificaciones"];
// Contenido del sitio y redirecciones SEO: SUPERADMIN + CMS_EDITOR (set CONTENT).
// El módulo /admin/email-templates sigue en solo-SUPERADMIN.
const CONTENT_PATHS = ["/admin/contenido", "/admin/redirects"];
// Autoservicio de cuenta (MFA obligatorio, B-1): los cuatro roles.
const ACCOUNT_PATHS = ["/admin/seguridad"];
// Rutas fuera de alcance de MANAGER/FULFILLMENT/CMS_EDITOR:
const SUPERADMIN_ONLY_PATHS = [
  "/admin/finanzas",
  "/admin/fidelizacion",
  "/admin/usuarios",
  "/admin/integraciones",
  "/admin/integraciones/aveonline",
  "/admin/auditoria",
  "/admin/canales/mercadolibre",
  "/admin/metricas",
  "/admin/performance",
  "/admin/email-templates",
  "/admin/contenido/paginas/global",
];

describe("canAccessAdminPath — SUPERADMIN", () => {
  it("permite acceso a TODAS las rutas listadas", () => {
    for (const p of [
      ...SHARED_PATHS,
      ...MANAGER_UP_PATHS,
      ...CATALOG_PATHS,
      ...CONTENT_PATHS,
      ...ACCOUNT_PATHS,
      ...SUPERADMIN_ONLY_PATHS,
    ]) {
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

  it("permite pedidos y dashboard (compartidas con todos los operativos)", () => {
    for (const p of SHARED_PATHS) {
      expect(canAccessAdminPath("MANAGER", p)).toBe(true);
    }
  });

  it("permite garantías (MANAGER_UP — N-21: la ruta replica el permiso de la página)", () => {
    for (const p of MANAGER_UP_PATHS) {
      expect(canAccessAdminPath("MANAGER", p)).toBe(true);
    }
  });

  it("permite /admin/seguridad (autoservicio de cuenta — MFA obligatorio, B-1)", () => {
    for (const p of ACCOUNT_PATHS) {
      expect(canAccessAdminPath("MANAGER", p)).toBe(true);
    }
  });

  it("NIEGA finanzas y usuarios (deny-by-default)", () => {
    expect(canAccessAdminPath("MANAGER", "/admin/finanzas")).toBe(false);
    expect(canAccessAdminPath("MANAGER", "/admin/usuarios")).toBe(false);
  });

  it("NIEGA contenido del sitio (set CONTENT: solo SUPERADMIN/CMS_EDITOR)", () => {
    for (const p of CONTENT_PATHS) {
      expect(canAccessAdminPath("MANAGER", p)).toBe(false);
    }
  });

  it("NIEGA toda ruta no listada", () => {
    for (const p of SUPERADMIN_ONLY_PATHS) {
      expect(canAccessAdminPath("MANAGER", p)).toBe(false);
    }
  });
});

describe("canAccessAdminPath — FULFILLMENT", () => {
  it("permite SOLO pedidos y dashboard", () => {
    for (const p of SHARED_PATHS) {
      expect(canAccessAdminPath("FULFILLMENT", p)).toBe(true);
    }
  });

  it("permite /admin/seguridad (autoservicio de cuenta — MFA obligatorio, B-1)", () => {
    for (const p of ACCOUNT_PATHS) {
      expect(canAccessAdminPath("FULFILLMENT", p)).toBe(true);
    }
  });

  it("NIEGA todo el catálogo (incluye reseñas y clientes)", () => {
    for (const p of CATALOG_PATHS) {
      expect(canAccessAdminPath("FULFILLMENT", p)).toBe(false);
    }
  });

  it("NIEGA garantías (N-21: la página exige SUPER+MANAGER — la ruta ya no la ofrece)", () => {
    for (const p of MANAGER_UP_PATHS) {
      expect(canAccessAdminPath("FULFILLMENT", p)).toBe(false);
    }
  });

  it("NIEGA toda ruta no listada (finanzas/usuarios/etc.)", () => {
    for (const p of SUPERADMIN_ONLY_PATHS) {
      expect(canAccessAdminPath("FULFILLMENT", p)).toBe(false);
    }
  });

  it("NIEGA contenido del sitio (set CONTENT: solo SUPERADMIN/CMS_EDITOR)", () => {
    for (const p of CONTENT_PATHS) {
      expect(canAccessAdminPath("FULFILLMENT", p)).toBe(false);
    }
  });
});

describe("canAccessAdminPath — CMS_EDITOR", () => {
  it("permite contenido del sitio (incluye la página 'emails' del CMS)", () => {
    for (const p of CONTENT_PATHS) {
      expect(canAccessAdminPath("CMS_EDITOR", p)).toBe(true);
    }
  });

  it("NIEGA el módulo de plantillas de correo (Fase 4: subió a solo-SUPERADMIN)", () => {
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/email-templates")).toBe(false);
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/email-templates/order-confirmation")).toBe(
      false,
    );
  });

  it("permite subrutas editoriales del CMS y NIEGA Ajustes del sitio (global = SUPERADMIN)", () => {
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/contenido/paginas/global")).toBe(false);
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/contenido/configuracion")).toBe(false);
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/contenido/paginas/inicio")).toBe(true);
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/contenido/campos/abc123")).toBe(true);
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/contenido?q=footer")).toBe(true);
  });

  it("permite /admin/seguridad (autoservicio de cuenta — MFA obligatorio, B-1)", () => {
    for (const p of ACCOUNT_PATHS) {
      expect(canAccessAdminPath("CMS_EDITOR", p)).toBe(true);
    }
  });

  it("NIEGA el dashboard (su home es /admin/contenido — ver adminHomePath)", () => {
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/dashboard")).toBe(false);
  });

  it("NIEGA pedidos y reclamos (rutas de roles operativos)", () => {
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/pedidos")).toBe(false);
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/garantias")).toBe(false);
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/retractos")).toBe(false);
  });

  it("NIEGA todo el catálogo", () => {
    for (const p of CATALOG_PATHS) {
      expect(canAccessAdminPath("CMS_EDITOR", p)).toBe(false);
    }
  });

  it("NIEGA usuarios, finanzas, cupones y toda ruta solo-SUPERADMIN", () => {
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/usuarios")).toBe(false);
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/finanzas")).toBe(false);
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/cupones")).toBe(false);
    for (const p of SUPERADMIN_ONLY_PATHS) {
      expect(canAccessAdminPath("CMS_EDITOR", p)).toBe(false);
    }
  });

  it("NIEGA rutas arbitrarias/no listadas (deny-by-default)", () => {
    expect(canAccessAdminPath("CMS_EDITOR", "/admin/ruta-que-no-existe")).toBe(false);
    expect(canAccessAdminPath("CMS_EDITOR", "/admin")).toBe(false);
    expect(canAccessAdminPath("CMS_EDITOR", "")).toBe(false);
  });
});

describe("canAccessAdminPath — matriz completa rol × ruta representativa", () => {
  // [ruta, SUPERADMIN, MANAGER, FULFILLMENT, CMS_EDITOR]
  const matrix: Array<[string, boolean, boolean, boolean, boolean]> = [
    ["/admin/dashboard", true, true, true, false],
    ["/admin/pedidos", true, true, true, false],
    // N-21: garantías = SUPER+MANAGER (la página exige MANAGER_UP); retractos = SUPER
    // (página y actions SUPER). Antes ambas eran ALL y el rol rebotaba con ?denied=1.
    ["/admin/garantias", true, true, false, false],
    ["/admin/retractos", true, true, false, false],
    ["/admin/soporte", true, true, false, false],
    ["/admin/productos", true, true, false, false],
    ["/admin/inventario", true, true, false, false],
    ["/admin/categorias", true, true, false, false],
    ["/admin/ocasiones", true, true, false, false],
    ["/admin/resenas", true, true, false, false],
    ["/admin/clientes", true, true, false, false],
    ["/admin/notificaciones", true, true, false, false],
    ["/admin/materiales", true, true, false, false],
    ["/admin/contenido", true, false, false, true],
    ["/admin/redirects", true, false, false, true],
    ["/admin/contenido/paginas/global", true, false, false, false],
    // Fase 4 (2026-09-18): el módulo de plantillas es config sensible → SUPER.
    ["/admin/email-templates", true, false, false, false],
    ["/admin/finanzas", true, false, false, false],
    ["/admin/usuarios", true, false, false, false],
    // B-1: autoservicio de cuenta (MFA obligatorio) → los cuatro roles.
    ["/admin/seguridad", true, true, true, true],
    ["/admin/mayorista", true, true, false, false],
    ["/admin/cupones", true, true, false, false],
    ["/admin/fidelizacion", true, false, false, false],
    ["/admin/auditoria", true, false, false, false],
  ];

  it.each(matrix)("%s → SA=%s MGR=%s FUL=%s CMS=%s", (path, sa, mgr, ful, cms) => {
    expect(canAccessAdminPath("SUPERADMIN", path)).toBe(sa);
    expect(canAccessAdminPath("MANAGER", path)).toBe(mgr);
    expect(canAccessAdminPath("FULFILLMENT", path)).toBe(ful);
    expect(canAccessAdminPath("CMS_EDITOR", path)).toBe(cms);
  });
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
    // '/admin/seguridadX' NO hereda el acceso abierto de '/admin/seguridad'.
    expect(canAccessAdminPath("FULFILLMENT", "/admin/seguridadX")).toBe(false);
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
    // Grupo mixto: pedidos (todos los operativos), garantías (SUPER+MANAGER — N-21)
    // y catálogo (solo manager).
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
    // Grupo casi todo superadmin: desde B-1 Seguridad es autoservicio de
    // cuenta (todos los roles), así que el grupo sobrevive con ese solo item.
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
  it("conserva dashboard, operación, catálogo y Sistema (solo Seguridad); descarta Auditoría", () => {
    const out = filterNavByRole(buildNav(), "MANAGER");
    const labels = out.map((g) => g.label);
    expect(labels).toEqual(["Dashboard", "Operación", "Catálogo", "Sistema"]);
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

  it("Sistema queda solo con Seguridad (finanzas/usuarios son solo-SUPERADMIN)", () => {
    const out = filterNavByRole(buildNav(), "MANAGER");
    const sistema = out.find((g) => g.label === "Sistema");
    expect(sistema?.items?.map((i) => i.href)).toEqual(["/admin/seguridad"]);
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
  it("conserva dashboard, operación (solo pedidos) y Sistema (solo Seguridad)", () => {
    const out = filterNavByRole(buildNav(), "FULFILLMENT");
    expect(out.map((g) => g.label)).toEqual(["Dashboard", "Operación", "Sistema"]);
  });

  it("filtra Operación a SOLO pedidos (N-21: garantías es SUPER+MANAGER, ya no se ofrece)", () => {
    const out = filterNavByRole(buildNav(), "FULFILLMENT");
    const operacion = out.find((g) => g.label === "Operación");
    expect(operacion?.items?.map((i) => i.href)).toEqual(["/admin/pedidos"]);
  });

  it("descarta el grupo Catálogo completo (queda vacío)", () => {
    const out = filterNavByRole(buildNav(), "FULFILLMENT");
    expect(out.find((g) => g.label === "Catálogo")).toBeUndefined();
  });

  it("Sistema queda solo con Seguridad (autoservicio MFA, B-1)", () => {
    const out = filterNavByRole(buildNav(), "FULFILLMENT");
    const sistema = out.find((g) => g.label === "Sistema");
    expect(sistema?.items?.map((i) => i.href)).toEqual(["/admin/seguridad"]);
  });
});

describe("filterNavByRole — CMS_EDITOR", () => {
  // Nav representativo con grupo de contenido (como el real: Contenido y
  // Configuración mezclan items de contenido con items solo-SUPERADMIN).
  function buildNavConContenido(): NavGroup[] {
    return [
      { label: "Dashboard", href: "/admin/dashboard" },
      {
        label: "Contenido",
        items: [
          { label: "Páginas del sitio", href: "/admin/contenido" },
          { label: "Redirecciones URL", href: "/admin/redirects" },
        ],
      },
      {
        label: "Configuración",
        items: [
          { label: "Ajustes del sitio", href: "/admin/contenido/paginas/global" },
          { label: "Seguridad (2 pasos)", href: "/admin/seguridad" },
          { label: "Usuarios y acceso", href: "/admin/usuarios" },
          { label: "Plantillas de correo", href: "/admin/email-templates" },
        ],
      },
      { label: "Soporte", href: "/admin/soporte" },
    ];
  }

  it("ve SOLO Contenido y Configuración; descarta dashboard, soporte y demás grupos", () => {
    const out = filterNavByRole(buildNavConContenido(), "CMS_EDITOR");
    expect(out.map((g) => g.label)).toEqual(["Contenido", "Configuración"]);
  });

  it("Contenido incluye 'Páginas del sitio' y 'Redirecciones URL' (cms:write)", () => {
    const out = filterNavByRole(buildNavConContenido(), "CMS_EDITOR");
    const contenido = out.find((g) => g.label === "Contenido");
    expect(contenido?.items?.map((i) => i.href)).toEqual(["/admin/contenido", "/admin/redirects"]);
  });

  it("Configuración queda solo con 'Seguridad' (B-1); 'Ajustes del sitio' y 'Plantillas de correo' son solo SUPERADMIN", () => {
    const out = filterNavByRole(buildNavConContenido(), "CMS_EDITOR");
    const config = out.find((g) => g.label === "Configuración");
    expect(config?.items?.map((i) => i.href)).toEqual(["/admin/seguridad"]);
  });

  it("con el nav genérico (sin rutas de contenido) solo ve Sistema > Seguridad (B-1)", () => {
    const out = filterNavByRole(buildNav(), "CMS_EDITOR");
    expect(out.map((g) => g.label)).toEqual(["Sistema"]);
    expect(out[0].items?.map((i) => i.href)).toEqual(["/admin/seguridad"]);
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
  it("los cuatro roles del enum se comportan de forma determinista", () => {
    const roles: AdminRole[] = ["SUPERADMIN", "MANAGER", "FULFILLMENT", "CMS_EDITOR"];
    for (const role of roles) {
      // pedidos: accesible solo para los tres roles operativos.
      expect(canAccessAdminPath(role, "/admin/pedidos")).toBe(role !== "CMS_EDITOR");
      // seguridad: TODOS los roles (autoservicio de cuenta — MFA obligatorio, B-1).
      expect(canAccessAdminPath(role, "/admin/seguridad")).toBe(true);
      // contenido: SUPERADMIN y CMS_EDITOR (set CONTENT).
      expect(canAccessAdminPath(role, "/admin/contenido")).toBe(
        role === "SUPERADMIN" || role === "CMS_EDITOR",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// adminHomePath
// ---------------------------------------------------------------------------

describe("adminHomePath — home del panel por rol", () => {
  it("los roles operativos aterrizan en /admin/dashboard", () => {
    expect(adminHomePath("SUPERADMIN")).toBe("/admin/dashboard");
    expect(adminHomePath("MANAGER")).toBe("/admin/dashboard");
    expect(adminHomePath("FULFILLMENT")).toBe("/admin/dashboard");
  });

  it("CMS_EDITOR aterriza en /admin/contenido (no tiene acceso al dashboard)", () => {
    expect(adminHomePath("CMS_EDITOR")).toBe("/admin/contenido");
  });

  it("la home devuelta SIEMPRE es una ruta accesible para ese rol (anti-loop)", () => {
    const roles: AdminRole[] = [
      "SUPERADMIN",
      "OPERATIONS_MANAGER",
      "CUSTOMER_SUPPORT",
      "PRINT_WORKSHOP",
      "FINANCE_ANALYST",
      "MANAGER",
      "FULFILLMENT",
      "CMS_EDITOR",
    ];
    for (const role of roles) {
      expect(canAccessAdminPath(role, adminHomePath(role))).toBe(true);
    }
  });
});

describe("S17 — Matriz por capacidades (AdminCapability) y nuevos perfiles operativos", () => {
  it("SUPERADMIN posee el 100 % de ADMIN_CAPABILITIES", () => {
    for (const cap of ADMIN_CAPABILITIES) {
      expect(hasCapability("SUPERADMIN", cap)).toBe(true);
    }
  });

  it("PRINT_WORKSHOP puede preparar pedidos, descargar ZIP y moderar, pero NO leer PII ni Contacto 360", () => {
    expect(hasCapability("PRINT_WORKSHOP", "orders:read_operational")).toBe(true);
    expect(hasCapability("PRINT_WORKSHOP", "orders:transition")).toBe(true);
    expect(hasCapability("PRINT_WORKSHOP", "production:download_assets")).toBe(true);
    expect(hasCapability("PRINT_WORKSHOP", "production:moderate")).toBe(true);
    expect(hasCapability("PRINT_WORKSHOP", "orders:read_pii")).toBe(false);
    expect(hasCapability("PRINT_WORKSHOP", "contacts:read_360")).toBe(false);
    expect(hasCapability("PRINT_WORKSHOP", "contacts:read_pii")).toBe(false);
    expect(hasCapability("PRINT_WORKSHOP", "finance:read")).toBe(false);

    expect(canAccessAdminPath("PRINT_WORKSHOP", "/admin/pedidos")).toBe(true);
    expect(canAccessAdminPath("PRINT_WORKSHOP", "/admin/moderacion")).toBe(true);
    expect(canAccessAdminPath("PRINT_WORKSHOP", "/admin/clientes")).toBe(false);
    expect(canAccessAdminPath("PRINT_WORKSHOP", "/admin/finanzas")).toBe(false);
    expect(ADMIN_ROLE_SETS.SHIPPING_GUIDE_PRINT).not.toContain("PRINT_WORKSHOP");
    expect(ADMIN_ROLE_SETS.PRODUCTION_DOWNLOAD).not.toContain("FULFILLMENT");
    expect(ADMIN_ROLE_SETS.SHIPPING_GUIDE_PRINT).toContain("FULFILLMENT");
  });

  it("CUSTOMER_SUPPORT atiende tickets, garantías, retractos y Contacto 360, pero NO fusiona duplicados, NO reembolsa ni exporta CSV", () => {
    expect(hasCapability("CUSTOMER_SUPPORT", "support:manage")).toBe(true);
    expect(hasCapability("CUSTOMER_SUPPORT", "warranty:manage")).toBe(true);
    expect(hasCapability("CUSTOMER_SUPPORT", "warranty:refund")).toBe(false);
    expect(hasCapability("CUSTOMER_SUPPORT", "retract:manage")).toBe(true);
    expect(hasCapability("CUSTOMER_SUPPORT", "retract:refund")).toBe(false);
    expect(hasCapability("CUSTOMER_SUPPORT", "contacts:read_360")).toBe(true);
    expect(hasCapability("CUSTOMER_SUPPORT", "contacts:read_pii")).toBe(true);
    expect(hasCapability("CUSTOMER_SUPPORT", "contacts:merge")).toBe(false);
    expect(hasCapability("CUSTOMER_SUPPORT", "orders:transition")).toBe(false);
    expect(hasCapability("CUSTOMER_SUPPORT", "marketing:export_csv")).toBe(false);
    expect(hasCapability("CUSTOMER_SUPPORT", "catalog:write")).toBe(false);

    // Longest-prefix match: /admin/clientes permitido, /admin/clientes/duplicados bloqueado
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/clientes")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/clientes/ck_123")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/clientes/duplicados")).toBe(false);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/soporte")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/mensajes")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/garantias")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/reclamos")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/retractos")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/resenas")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/carritos")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/carritos/configuracion")).toBe(false);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/productos")).toBe(false);
  });

  it("FINANCE_ANALYST opera finanzas, conciliación COD, costos, métricas, pasivos posventa y export contable con PII enmascarado y sin tocar catálogo ni staff", () => {
    expect(hasCapability("FINANCE_ANALYST", "finance:read")).toBe(true);
    expect(hasCapability("FINANCE_ANALYST", "finance:reconcile_cod")).toBe(true);
    expect(hasCapability("FINANCE_ANALYST", "finance:export_csv")).toBe(true);
    expect(hasCapability("FINANCE_ANALYST", "metrics:read")).toBe(true);
    expect(hasCapability("FINANCE_ANALYST", "orders:read_pii")).toBe(false);
    expect(ADMIN_ROLE_SETS.SHIPPING_GUIDE_PRINT).not.toContain("FINANCE_ANALYST");
    expect(hasCapability("FINANCE_ANALYST", "orders:transition")).toBe(false);
    expect(hasCapability("FINANCE_ANALYST", "catalog:write")).toBe(false);
    expect(hasCapability("FINANCE_ANALYST", "staff:manage")).toBe(false);
    expect(hasCapability("FINANCE_ANALYST", "warranty:manage")).toBe(false);
    expect(hasCapability("FINANCE_ANALYST", "warranty:refund")).toBe(false);
    expect(hasCapability("FINANCE_ANALYST", "retract:manage")).toBe(false);
    expect(hasCapability("FINANCE_ANALYST", "retract:refund")).toBe(false);

    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/finanzas")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/finanzas/conciliacion")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/finanzas/bloqueos")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/finanzas/export")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/costos")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/retractos")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/garantias")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/reclamos")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/mayorista")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/cupones")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/cupones/cp_123")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/fidelizacion")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/metricas")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/soporte")).toBe(false);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/resenas")).toBe(false);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/clientes")).toBe(false);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/productos")).toBe(false);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/usuarios")).toBe(false);
  });

  it("OPERATIONS_MANAGER equivale funcionalmente a gerencia operativa (incluye notificaciones, materiales, canales de tienda, envíos, fusión de duplicados y marketing)", () => {
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/notificaciones")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/materiales")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/costos")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/mayorista")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/cupones")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/cupones/cp_123")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/fidelizacion")).toBe(false);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/plantillas")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/disenos")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/fichas")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/canales")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/canales/tienda")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/canales/mercadolibre")).toBe(false);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/envios")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/integraciones")).toBe(false);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/integraciones/aveonline")).toBe(false);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/clientes")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/clientes/duplicados")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/marketing/suscriptores")).toBe(true);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/finanzas")).toBe(false);
    expect(canAccessAdminPath("OPERATIONS_MANAGER", "/admin/usuarios")).toBe(false);
    expect(ADMIN_ROLE_SETS.COSTOS_READ).toEqual([
      "SUPERADMIN",
      "OPERATIONS_MANAGER",
      "FINANCE_ANALYST",
      "MANAGER",
    ]);
    expect(rolesWithCapability("staff:manage")).toEqual(["SUPERADMIN"]);
  });

  it("Bloque 4 — paridad N-21 en CRM 360, duplicados y oportunidades B2B", () => {
    // CUSTOMER_SUPPORT gestiona oportunidades y pedidos, pero NO descarga activos 300 DPI.
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/oportunidades")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/oportunidades/opp_123")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/pedidos")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/pedidos/LCM-2026-0001")).toBe(true);
    expect(canAccessAdminPath("CUSTOMER_SUPPORT", "/admin/pedidos/LCM-2026-0001/produccion")).toBe(
      false,
    );

    // Gerencia operativa accede al flujo comercial, pedidos y producción.
    for (const role of ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"] as const) {
      expect(canAccessAdminPath(role, "/admin/oportunidades")).toBe(true);
      expect(canAccessAdminPath(role, "/admin/pedidos")).toBe(true);
      expect(canAccessAdminPath(role, "/admin/pedidos/LCM-2026-0001/produccion")).toBe(true);
      expect(canAccessAdminPath(role, "/admin/clientes/duplicados")).toBe(true);
    }

    // Estos roles no acceden al embudo B2B ni a duplicados.
    for (const role of ["FINANCE_ANALYST", "FULFILLMENT", "CMS_EDITOR"] as const) {
      expect(canAccessAdminPath(role, "/admin/oportunidades")).toBe(false);
      expect(canAccessAdminPath(role, "/admin/clientes/duplicados")).toBe(false);
    }
  });

  it("Bloque 5 — paridad N-21 en subrutas de pedidos (/produccion y /guia), segregación por etapa y confidencialidad COP", () => {
    // /admin/pedidos/[n]/produccion (ZIP 300 DPI): exclusivo production:download_assets
    for (const role of ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER", "PRINT_WORKSHOP"] as const) {
      expect(canAccessAdminPath(role, "/admin/pedidos/LCM-2026-0001/produccion")).toBe(true);
    }
    for (const role of [
      "FULFILLMENT",
      "CUSTOMER_SUPPORT",
      "FINANCE_ANALYST",
      "CMS_EDITOR",
    ] as const) {
      expect(canAccessAdminPath(role, "/admin/pedidos/LCM-2026-0001/produccion")).toBe(false);
    }

    // /admin/pedidos/[n]/guia (guía física térmica): exclusivo SHIPPING_GUIDE_PRINT
    for (const role of [
      "SUPERADMIN",
      "OPERATIONS_MANAGER",
      "MANAGER",
      "FULFILLMENT",
      "CUSTOMER_SUPPORT",
    ] as const) {
      expect(canAccessAdminPath(role, "/admin/pedidos/LCM-2026-0001/guia")).toBe(true);
      expect(canAccessAdminPath(role, "/admin/pedidos/LCM-2026-0001/guia?print=1")).toBe(true);
    }
    for (const role of ["PRINT_WORKSHOP", "FINANCE_ANALYST", "CMS_EDITOR"] as const) {
      expect(canAccessAdminPath(role, "/admin/pedidos/LCM-2026-0001/guia")).toBe(false);
    }

    // Segregación por etapa en transiciones de Order
    expect(canTransitionOrderTo("PRINT_WORKSHOP", "FULFILLING")).toBe(true);
    expect(canTransitionOrderTo("PRINT_WORKSHOP", "SHIPPED")).toBe(false);
    expect(canTransitionOrderTo("PRINT_WORKSHOP", "DELIVERED")).toBe(false);
    expect(canTransitionOrderTo("PRINT_WORKSHOP", "CANCELLED")).toBe(false);

    expect(canTransitionOrderTo("FULFILLMENT", "FULFILLING")).toBe(true);
    expect(canTransitionOrderTo("FULFILLMENT", "SHIPPED")).toBe(true);
    expect(canTransitionOrderTo("FULFILLMENT", "DELIVERED")).toBe(true);
    expect(canTransitionOrderTo("FULFILLMENT", "CANCELLED")).toBe(false);

    for (const role of ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"] as const) {
      expect(canTransitionOrderTo(role, "FULFILLING")).toBe(true);
      expect(canTransitionOrderTo(role, "SHIPPED")).toBe(true);
      expect(canTransitionOrderTo(role, "DELIVERED")).toBe(true);
      expect(canTransitionOrderTo(role, "CANCELLED")).toBe(true);
    }
    expect(canTransitionOrderTo("CUSTOMER_SUPPORT", "FULFILLING")).toBe(false);
    expect(canTransitionOrderTo("FINANCE_ANALYST", "CANCELLED")).toBe(false);

    // Reintentar guía Aveonline vs gestionar RenderJob 300 DPI
    expect(canRetryOrderShipment("FULFILLMENT")).toBe(true);
    expect(canRetryOrderShipment("PRINT_WORKSHOP")).toBe(false);
    expect(canRetryOrderShipment("CUSTOMER_SUPPORT")).toBe(false);

    expect(canManageOrderRenderJobs("PRINT_WORKSHOP")).toBe(true);
    expect(canManageOrderRenderJobs("FULFILLMENT")).toBe(false);
    expect(canManageOrderRenderJobs("CUSTOMER_SUPPORT")).toBe(false);

    // Confidencialidad comercial COP
    expect(canSeeOrderCommercialBreakdown("PRINT_WORKSHOP")).toBe(false);
    expect(canSeeOrderCodCollectionAmount("PRINT_WORKSHOP")).toBe(false);

    expect(canSeeOrderCommercialBreakdown("FULFILLMENT")).toBe(false);
    expect(canSeeOrderCodCollectionAmount("FULFILLMENT")).toBe(true);

    for (const role of [
      "SUPERADMIN",
      "OPERATIONS_MANAGER",
      "MANAGER",
      "FINANCE_ANALYST",
      "CUSTOMER_SUPPORT",
    ] as const) {
      expect(canSeeOrderCommercialBreakdown(role)).toBe(true);
      expect(canSeeOrderCodCollectionAmount(role)).toBe(true);
    }
  });

  it("Bloque 6 — Posventa, Atención y Reputación (D1 lectura contable, D2 reembolso unificado SUPERADMIN, D3 lectura reputacional y B-7)", () => {
    // D2: Salida efectiva de dinero en posventa unificada en SUPERADMIN
    expect(rolesWithCapability("retract:refund")).toEqual(["SUPERADMIN"]);
    expect(rolesWithCapability("warranty:refund")).toEqual(["SUPERADMIN"]);
    expect(hasCapability("OPERATIONS_MANAGER", "warranty:manage")).toBe(true);
    expect(hasCapability("OPERATIONS_MANAGER", "warranty:refund")).toBe(false);
    expect(hasCapability("OPERATIONS_MANAGER", "retract:manage")).toBe(true);
    expect(hasCapability("OPERATIONS_MANAGER", "retract:refund")).toBe(false);
    expect(hasCapability("MANAGER", "warranty:refund")).toBe(false);
    expect(hasCapability("MANAGER", "retract:refund")).toBe(false);

    // D1: Garantías, Reclamos y Retractos visibles en lectura contable para FINANCE_ANALYST
    for (const role of [
      "SUPERADMIN",
      "OPERATIONS_MANAGER",
      "CUSTOMER_SUPPORT",
      "FINANCE_ANALYST",
      "MANAGER",
    ] as const) {
      expect(canAccessAdminPath(role, "/admin/garantias")).toBe(true);
      expect(canAccessAdminPath(role, "/admin/reclamos")).toBe(true);
      expect(canAccessAdminPath(role, "/admin/reclamos/clm_123")).toBe(true);
      expect(canAccessAdminPath(role, "/admin/retractos")).toBe(true);
    }
    for (const role of ["FULFILLMENT", "PRINT_WORKSHOP", "CMS_EDITOR"] as const) {
      expect(canAccessAdminPath(role, "/admin/garantias")).toBe(false);
      expect(canAccessAdminPath(role, "/admin/reclamos")).toBe(false);
      expect(canAccessAdminPath(role, "/admin/reclamos/clm_123")).toBe(false);
      expect(canAccessAdminPath(role, "/admin/retractos")).toBe(false);
    }

    // D3: Reseñas en lectura para CUSTOMER_SUPPORT; moderación exclusiva catalog:write
    for (const role of [
      "SUPERADMIN",
      "OPERATIONS_MANAGER",
      "CUSTOMER_SUPPORT",
      "MANAGER",
    ] as const) {
      expect(canAccessAdminPath(role, "/admin/resenas")).toBe(true);
      expect(canAccessAdminPath(role, "/admin/soporte")).toBe(true);
      expect(canAccessAdminPath(role, "/admin/mensajes")).toBe(true);
    }
    expect(hasCapability("CUSTOMER_SUPPORT", "catalog:write")).toBe(false);
    for (const role of [
      "FINANCE_ANALYST",
      "FULFILLMENT",
      "PRINT_WORKSHOP",
      "CMS_EDITOR",
    ] as const) {
      expect(canAccessAdminPath(role, "/admin/resenas")).toBe(false);
      expect(canAccessAdminPath(role, "/admin/soporte")).toBe(false);
      expect(canAccessAdminPath(role, "/admin/mensajes")).toBe(false);
    }
  });

  it("Bloque 7 — Finanzas, Riesgo COD y Automatización de Marketing (A1, A2, A3 + maskBlockedIdentityValue)", () => {
    // A3: carts:configure exclusivo SUPERADMIN
    expect(rolesWithCapability("carts:configure")).toEqual(["SUPERADMIN"]);
    expect(canAccessAdminPath("SUPERADMIN", "/admin/carritos/configuracion")).toBe(true);
    for (const role of [
      "OPERATIONS_MANAGER",
      "MANAGER",
      "CUSTOMER_SUPPORT",
      "FINANCE_ANALYST",
      "FULFILLMENT",
      "PRINT_WORKSHOP",
      "CMS_EDITOR",
    ] as const) {
      expect(canAccessAdminPath(role, "/admin/carritos/configuracion")).toBe(false);
    }

    // A3: FINANCE_ANALYST lee en modo 0-PII Carritos y Lifecycle (incl. preview sintético),
    // pero NO accede a rutas de mutación ni a preview con PII real de carrito
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/finanzas")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/finanzas/conciliacion")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/finanzas/bloqueos")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/carritos")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/carritos/caaaaaaaaaaaaaaaaaaaaaaaa")).toBe(
      true,
    );
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/carritos/enviar")).toBe(false);
    expect(
      canAccessAdminPath("FINANCE_ANALYST", "/admin/carritos/caaaaaaaaaaaaaaaaaaaaaaaa/preview"),
    ).toBe(false);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/lifecycle")).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/lifecycle/jrn_post_compra")).toBe(true);
    expect(
      canAccessAdminPath("FINANCE_ANALYST", "/admin/lifecycle/jrn_post_compra/preview?stepId=s1"),
    ).toBe(true);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/lifecycle/nuevo")).toBe(false);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/marketing/suscriptores")).toBe(false);
    expect(canAccessAdminPath("FINANCE_ANALYST", "/admin/marketing/segmentos")).toBe(false);

    // Roles operativos con carts:recover sí acceden a enviar y preview de carrito
    for (const role of [
      "SUPERADMIN",
      "OPERATIONS_MANAGER",
      "MANAGER",
      "CUSTOMER_SUPPORT",
    ] as const) {
      expect(canAccessAdminPath(role, "/admin/carritos/enviar")).toBe(true);
      expect(canAccessAdminPath(role, "/admin/carritos/caaaaaaaaaaaaaaaaaaaaaaaa/preview")).toBe(
        true,
      );
    }

    // A1: Enmascaramiento server-side de identidades bloqueadas COD
    expect(maskBlockedIdentityValue("EMAIL", "cliente@lucamsshop.com")).not.toContain("cliente");
    expect(maskBlockedIdentityValue("PHONE", "+573001234567")).toContain("67");
    expect(maskBlockedIdentityValue("PHONE", "+573001234567")).not.toContain("300123");
    expect(maskBlockedIdentityValue("ADDRESS", "bogota:calle 100 15 20")).toBe(
      "bogota · [dirección protegida]",
    );
  });
});

describe("Bloque 8 — salud técnica, performance y alcance RBAC de notificaciones", () => {
  it("restringe /admin/observability y /admin/performance exclusivamente a SUPERADMIN", () => {
    expect(canAccessAdminPath("SUPERADMIN", "/admin/observability")).toBe(true);
    expect(canAccessAdminPath("SUPERADMIN", "/admin/performance")).toBe(true);

    for (const role of [
      "OPERATIONS_MANAGER",
      "MANAGER",
      "CUSTOMER_SUPPORT",
      "FINANCE_ANALYST",
      "FULFILLMENT",
      "PRINT_WORKSHOP",
      "CMS_EDITOR",
    ] as const) {
      expect(canAccessAdminPath(role, "/admin/observability")).toBe(false);
      expect(canAccessAdminPath(role, "/admin/performance")).toBe(false);
    }
  });

  it("getNotificationRouteScope coincide exactamente con canAccessAdminPath para actionUrl reales", () => {
    const sampleUrls = [
      "/admin/pedidos",
      "/admin/pedidos?atencion=1",
      "/admin/pedidos/LCM-2026-0001",
      "/admin/oportunidades",
      "/admin/oportunidades/opp_1",
      "/admin/inventario?stock=low",
      "/admin/metricas",
      "/admin/observability",
      "/admin/auditoria?vista=seguridad",
      "/admin/integraciones",
      "/admin/finanzas",
    ];

    const matchesPrefix = (url: string, prefix: string) =>
      url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);

    expect(getNotificationRouteScope("SUPERADMIN").unrestricted).toBe(true);

    for (const role of [
      "OPERATIONS_MANAGER",
      "MANAGER",
      "CUSTOMER_SUPPORT",
      "FINANCE_ANALYST",
      "FULFILLMENT",
      "PRINT_WORKSHOP",
      "CMS_EDITOR",
    ] as const) {
      const scope = getNotificationRouteScope(role);
      expect(scope.unrestricted).toBe(false);
      if (scope.unrestricted) throw new Error("Expected restricted scope");

      for (const url of sampleUrls) {
        const sqlAllows =
          scope.allowedPrefixes.some((p) => matchesPrefix(url, p)) &&
          !scope.deniedPrefixes.some((p) => matchesPrefix(url, p));
        expect(sqlAllows).toBe(canAccessAdminPath(role, url));
      }
    }
  });
});

describe("Bloque C1 — guías, filtros y alcance dinámico de notificaciones", () => {
  it("la guía muestra el total solo si no es regalo y el rol tiene desglose o recaudo COD", () => {
    expect(canSeeOrderTotalInGuide("FULFILLMENT", false, false)).toBe(false);
    expect(canSeeOrderTotalInGuide("FULFILLMENT", false, true)).toBe(true);
    expect(canSeeOrderTotalInGuide("FULFILLMENT", true, true)).toBe(false);
    expect(canSeeOrderTotalInGuide("CUSTOMER_SUPPORT", false, false)).toBe(true);
    expect(canSeeOrderTotalInGuide("FINANCE_ANALYST", false, false)).toBe(true);
    expect(canSeeOrderTotalInGuide("FINANCE_ANALYST", true, true)).toBe(false);
  });

  it("solo PRINT_WORKSHOP pierde el filtro por método de pago", () => {
    expect(canFilterOrdersByPaymentMethod("PRINT_WORKSHOP")).toBe(false);
    for (const role of [
      "SUPERADMIN",
      "OPERATIONS_MANAGER",
      "MANAGER",
      "CUSTOMER_SUPPORT",
      "FINANCE_ANALYST",
      "FULFILLMENT",
      "CMS_EDITOR",
    ] as const) {
      expect(canFilterOrdersByPaymentMethod(role)).toBe(true);
    }
  });

  it("ROUTE_PATTERN_ROLES permite y deniega las mismas subrutas que canAccessAdminPath", () => {
    const urls = [
      "/admin/pedidos/LCM-2026-0001/produccion?print=1",
      "/admin/pedidos/LCM-2026-0001/produccionX",
      "/admin/pedidos/LCM-2026-0001/produccion",
      "/admin/pedidos/LCM-2026-0001/guia",
      "/admin/pedidos/LCM-2026-0001/guia/etiqueta?fuente=externa",
      "/admin/carritos/cart_1/preview",
      "/admin/carritos/cart_1",
    ];
    const matchesPrefix = (url: string, prefix: string) =>
      url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`);
    const matchesPattern = (url: string, pattern: { prefix: string; suffix: string }) =>
      url.startsWith(pattern.prefix) &&
      (url.endsWith(pattern.suffix) ||
        url.includes(`${pattern.suffix}?`) ||
        url.includes(`${pattern.suffix}/`));

    for (const role of [
      "OPERATIONS_MANAGER",
      "MANAGER",
      "CUSTOMER_SUPPORT",
      "FINANCE_ANALYST",
      "FULFILLMENT",
      "PRINT_WORKSHOP",
      "CMS_EDITOR",
    ] as const) {
      const scope = getNotificationRouteScope(role);
      expect(scope.unrestricted).toBe(false);
      if (scope.unrestricted) throw new Error("Expected restricted scope");

      for (const url of urls) {
        const sqlAllows =
          (scope.allowedPrefixes.some((prefix) => matchesPrefix(url, prefix)) ||
            scope.allowedPatterns.some((pattern) => matchesPattern(url, pattern))) &&
          !scope.deniedPrefixes.some((prefix) => matchesPrefix(url, prefix)) &&
          !scope.deniedPatterns.some((pattern) => matchesPattern(url, pattern));
        expect(sqlAllows).toBe(canAccessAdminPath(role, url));
      }
    }
  });

  it("ADR-210: separa opportunities:propose de CUSTOMER_SUPPORT y restringe finance:confirm_direct_payment a SUPERADMIN", () => {
    for (const role of ["SUPERADMIN", "OPERATIONS_MANAGER", "MANAGER"] as const) {
      expect(hasCapability(role, "opportunities:propose")).toBe(true);
    }
    for (const role of [
      "CUSTOMER_SUPPORT",
      "FINANCE_ANALYST",
      "FULFILLMENT",
      "PRINT_WORKSHOP",
      "CMS_EDITOR",
    ] as const) {
      expect(hasCapability(role, "opportunities:propose")).toBe(false);
    }

    expect(hasCapability("SUPERADMIN", "finance:confirm_direct_payment")).toBe(true);
    for (const role of [
      "OPERATIONS_MANAGER",
      "MANAGER",
      "CUSTOMER_SUPPORT",
      "FINANCE_ANALYST",
      "FULFILLMENT",
      "PRINT_WORKSHOP",
      "CMS_EDITOR",
    ] as const) {
      expect(hasCapability(role, "finance:confirm_direct_payment")).toBe(false);
    }
    expect(ADMIN_ROLE_SETS.FINANCE_DIRECT_PAYMENT).toEqual(["SUPERADMIN"]);
  });
});
