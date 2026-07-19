/*
 * Matriz RLS completa (Bloque E / R3, Lucy 2026-06-29).
 *
 * Complementa el guard R4 (rls-coverage: "toda tabla tiene candado") con la
 * prueba de que el candado REALMENTE aísla: el "impostor" — alguien con la
 * anon key pública (está en el bundle del cliente) o una sesión authenticated
 * cualquiera — NO puede leer ni escribir datos sensibles vía la API pública
 * (PostgREST). El acceso legítimo a esos datos es exclusivamente vía Prisma
 * (service_role) en el servidor.
 *
 * Hallazgo verificado 2026-06-29: en este proyecto anon Y authenticated reciben
 * `42501 permission denied` en TODAS las tablas (no hay GRANT a esos roles) →
 * PostgREST está cerrado; RLS habilitada es backstop. Esta matriz falla si esa
 * garantía se rompe (p.ej. si alguien agrega un GRANT con política demasiado
 * laxa y una tabla con PII empieza a filtrar).
 *
 * Requiere DATABASE_URL + las llaves Supabase. Sin ellas → skipIf.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");

const DATABASE_URL = process.env.DATABASE_URL;
const URL = strip(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = strip(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const SERVICE = strip(process.env.SUPABASE_SECRET_KEY);

const canRun = Boolean(DATABASE_URL && URL && ANON && SERVICE);

// Tablas con PII / privilegio que JAMÁS deben ser legibles ni escribibles vía la
// API pública por un rol anon o authenticated cualquiera.
const SENSITIVE = [
  "Customer",
  "Address",
  "AdminUser",
  "AdminRecoveryCode",
  "AdminActionLog",
  "Cart",
  "CartItem",
  "Order",
  "OrderItem",
  "CouponUsage",
  "AbandonedCart",
  "LoyaltyTxn",
  "Referral",
  "Consent",
  "SupportTicket",
  "Design",
  "DesignAsset",
  "WebhookEvent",
  "EmailEvent",
  "ErrorReport",
  // #11 — tablas nuevas con PII/datos sensibles que faltaban en la matriz (audit v3).
  "CodReconciliation",
  "RetractRequest",
  "WarrantyClaim",
  "WishlistItem",
  "BackInStockSubscription",
  "StockReservation",
] as const;

describe.skipIf(!canRun)("RLS matrix R3 — la API pública no filtra datos sensibles", () => {
  // Clientes LAZY (asignados en beforeAll, que no corre si el describe se salta).
  // Crearlos en el cuerpo del describe con `URL!` reventaría la colección cuando
  // faltan las llaves Supabase (createClient(undefined)) — p.ej. en un CI de solo
  // Postgres. Con esto el skipIf salta limpio sin romper el archivo.
  let anon: SupabaseClient;
  let service: SupabaseClient;
  let authed: SupabaseClient;
  let ephemeralUserId: string | undefined;

  beforeAll(async () => {
    anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    service = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    // Usuario efímero para ejercer el rol `authenticated` sin depender de cuentas reales.
    const email = `rls-matrix-${Date.now()}@example.com`;
    const password = "Rls-Matrix-Test-9182734650";
    const { data } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    ephemeralUserId = data.user?.id;
    authed = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await authed.auth.signInWithPassword({ email, password });
  });

  afterAll(async () => {
    if (ephemeralUserId) await service.auth.admin.deleteUser(ephemeralUserId);
  });

  // Un SELECT "filtra" solo si NO hubo error y devolvió filas. permission denied
  // (42501) o respuesta vacía = protegido.
  function leaked(res: { data: unknown[] | null; error: unknown }) {
    return !res.error && (res.data?.length ?? 0) > 0;
  }

  it.each(SENSITIVE)("anon NO puede leer %s", async (table) => {
    const res = await anon.from(table).select("*").limit(1);
    expect(leaked(res), `anon filtró datos de ${table}`).toBe(false);
  });

  it.each(SENSITIVE)("authenticated (impostor) NO puede leer %s", async (table) => {
    const res = await authed.from(table).select("*").limit(1);
    expect(leaked(res), `authenticated filtró datos de ${table}`).toBe(false);
  });

  it("AdminUser tiene datos (vía Prisma) pero CERO vía anon (prueba que filtra, no que esté vacía)", async () => {
    // El acceso legítimo es vía Prisma (conexión directa). Si hay AdminUsers ahí
    // pero anon ve 0, queda probado que RLS/grants filtran — no que la tabla esté vacía.
    const count = await prisma.adminUser.count();
    expect(count, "esperaba ≥1 AdminUser en la DB").toBeGreaterThan(0);
    const pub = await anon.from("AdminUser").select("id");
    expect(pub.data?.length ?? 0).toBe(0);
  });

  it("anon NO puede insertar en AdminUser (escalada de privilegio)", async () => {
    const res = await anon
      .from("AdminUser")
      .insert({ email: "evil@example.com", role: "SUPERADMIN", supabaseUserId: "evil-impostor" });
    expect(res.error, "el INSERT anon debería ser rechazado por RLS/grants").not.toBeNull();
  });

  it("anon NO puede insertar una Order falsa", async () => {
    const res = await anon.from("Order").insert({ number: "EVIL-1", total: 1 });
    expect(res.error, "el INSERT anon en Order debería ser rechazado").not.toBeNull();
  });

  // Además de leer/insertar, cerramos los verbos de escritura restantes: un
  // impostor tampoco debe poder MUTAR ni BORRAR filas sensibles vía PostgREST.
  it("anon NO puede actualizar Orders (manipular montos/estado)", async () => {
    const res = await anon.from("Order").update({ total: 0 }).eq("number", "EVIL-1");
    expect(res.error, "el UPDATE anon en Order debería ser rechazado").not.toBeNull();
  });

  it("anon NO puede borrar Customers (destrucción de datos)", async () => {
    const res = await anon.from("Customer").delete().eq("email", "evil@example.com");
    expect(res.error, "el DELETE anon en Customer debería ser rechazado").not.toBeNull();
  });
});
