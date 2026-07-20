/*
 * Regresión (plan de producción · P0 seguridad · MFA aal2).
 *
 * Las 11 acciones mutantes de catálogo (imágenes de producto, stock, bulk,
 * imágenes de variante) usaban getCurrentAdmin() —que NO valida el 2º factor— en
 * vez del guard central. Como Next expone cada Server Action como un endpoint POST
 * invocable directo, una sesión aal1 (contraseña robada, MFA inscrito pero sin
 * completar el 2º factor) podía mutar Product.images / ProductVariant.images /
 * stock / active / featured saltándose el MFA. Ahora pasan por
 * requireAdminAction({roles: MANAGER_UP}). Este test invoca las acciones REALES con
 * sesión aal1 y verifica que abortan con redirect a /admin/login/mfa — cubre el
 * bypass que el test unitario del guard no detecta (una acción podría dejar de
 * llamar al guard sin que aquél se entere).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    session: null as { admin: { id: string; role: string } } | null,
    aal: null as { currentLevel: string; nextLevel: string } | null,
  },
}));

class RedirectError extends Error {
  constructor(public to: string) {
    super("REDIRECT:" + to);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ getCurrentAdmin: async () => state.session }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal }) } },
  }),
}));

import {
  uploadProductImagesAction,
  reorderProductImagesAction,
  deleteProductImageAction,
} from "./image-actions";
import { setVariantStockAction } from "./stock-actions";
import {
  bulkActivateProductsAction,
  bulkDeactivateProductsAction,
  bulkFeatureProductsAction,
  bulkUnfeatureProductsAction,
} from "./bulk-actions";
import {
  uploadVariantImagesAction,
  reorderVariantImagesAction,
  deleteVariantImageAction,
} from "./[id]/variants/image-actions";

const fd = () => new FormData();

// Todas las acciones mutantes de catálogo que antes usaban getCurrentAdmin().
const CASES: Array<[string, () => Promise<unknown>]> = [
  ["uploadProductImagesAction", () => uploadProductImagesAction(fd())],
  ["reorderProductImagesAction", () => reorderProductImagesAction(fd())],
  ["deleteProductImageAction", () => deleteProductImageAction(fd())],
  ["setVariantStockAction", () => setVariantStockAction(null, fd())],
  ["bulkActivateProductsAction", () => bulkActivateProductsAction(fd())],
  ["bulkDeactivateProductsAction", () => bulkDeactivateProductsAction(fd())],
  ["bulkFeatureProductsAction", () => bulkFeatureProductsAction(fd())],
  ["bulkUnfeatureProductsAction", () => bulkUnfeatureProductsAction(fd())],
  ["uploadVariantImagesAction", () => uploadVariantImagesAction(fd())],
  ["reorderVariantImagesAction", () => reorderVariantImagesAction(fd())],
  ["deleteVariantImageAction", () => deleteVariantImageAction(fd())],
];

describe("acciones de catálogo — gate MFA aal2 (P0)", () => {
  beforeEach(() => {
    // Sesión con contraseña válida (SUPERADMIN) pero SIN 2º factor completado.
    state.session = { admin: { id: "a1", role: "SUPERADMIN" } };
    state.aal = { currentLevel: "aal1", nextLevel: "aal2" };
  });

  it.each(CASES)(
    "%s con sesión aal1 → aborta con redirect a /admin/login/mfa",
    async (_n, invoke) => {
      await expect(invoke()).rejects.toMatchObject({ to: "/admin/login/mfa" });
    },
  );

  it("con aal2 el guard ya no manda a /mfa (no sobre-bloquea)", async () => {
    state.aal = { currentLevel: "aal2", nextLevel: "aal2" };
    // Con 2º factor completo, bulkActivate pasa el gate y sigue su curso (fallará
    // luego por ids vacíos → redirect bulkError), pero NUNCA a /admin/login/mfa.
    await expect(bulkActivateProductsAction(fd())).rejects.not.toMatchObject({
      to: "/admin/login/mfa",
    });
  });
});
