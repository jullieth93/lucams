/*
 * Tests de integración de los CÓDIGOS DE RESPALDO MFA contra la DB real.
 *
 * Módulo DB-coupled (importa `prisma` de @/lib/db, vía @lucams/db). Foco
 * (Lucy 2026-06-27, módulo recién escrito):
 *   - generateRecoveryCodes: crea exactamente 10, devuelve los códigos en CLARO
 *     y persiste SOLO el hash sha256 (nunca el texto plano). Regenerar borra los
 *     anteriores (incluidos los ya usados).
 *   - countUnusedRecoveryCodes: cuenta solo los que tienen usedAt = null.
 *   - consumeRecoveryCode: un solo uso (segunda vez con el mismo código falla),
 *     código inexistente falla, normalización de formato (mayúsculas, guiones,
 *     espacios) acepta variaciones equivalentes, aislamiento por adminUserId.
 *
 * Requiere DATABASE_URL (corre vía `dotenv -e .env.local -- vitest`). Sin ella
 * se saltan (skipIf) para no romper CI sin DB.
 *
 * Aislamiento: cada corrida crea sus propios AdminUser efímeros con email/
 * supabaseUserId prefijados por un RUN único. afterAll borra esos AdminUser
 * (los AdminRecoveryCode caen por onDelete: Cascade) — no se toca data real.
 */

import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  consumeRecoveryCode,
  countUnusedRecoveryCodes,
  generateRecoveryCodes,
} from "./recovery-codes";

const hasDb = Boolean(process.env.DATABASE_URL);

// Prefijo único por corrida. Todos los AdminUser efímeros lo llevan en email y
// supabaseUserId → la limpieza borra exactamente lo que creamos.
const RUN = `mfaitest_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// Replica de la función de hash interna del módulo (no exportada) para verificar
// que lo persistido es realmente el sha256 del código normalizado y NO el claro.
function expectedHash(code: string): string {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

// Crea un AdminUser efímero y devuelve su id. Cada uno con identificadores únicos
// (email + supabaseUserId son @unique en el schema).
let seq = 0;
async function makeAdmin(): Promise<string> {
  seq += 1;
  const admin = await prisma.adminUser.create({
    data: {
      supabaseUserId: `${RUN}_sup_${seq}`,
      email: `${RUN}_${seq}@lucams.test`,
      role: "SUPERADMIN",
    },
    select: { id: true },
  });
  return admin.id;
}

// DB remota: cada test hace varios round-trips. Timeout amplio a nivel de suite
// para no flakear por latencia (el default de 5s no alcanza para los que consumen
// los 10 códigos en secuencia).
describe.skipIf(!hasDb)("admin-mfa/recovery-codes — integración DB (MFA respaldo)", { timeout: 30_000 }, () => {
  afterAll(async () => {
    // Borrar los AdminUser de esta corrida; AdminRecoveryCode cae por Cascade.
    await prisma.adminUser.deleteMany({
      where: { supabaseUserId: { startsWith: `${RUN}_sup_` } },
    });
  });

  // ───────────────────────── generateRecoveryCodes ─────────────────────────

  describe("generateRecoveryCodes", () => {
    it("devuelve exactamente 10 códigos en claro", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);
      expect(codes).toHaveLength(10);
    });

    it("persiste exactamente 10 filas, todas sin usar (usedAt = null)", async () => {
      const adminId = await makeAdmin();
      await generateRecoveryCodes(adminId);

      const total = await prisma.adminRecoveryCode.count({ where: { adminUserId: adminId } });
      const unused = await prisma.adminRecoveryCode.count({
        where: { adminUserId: adminId, usedAt: null },
      });
      expect(total).toBe(10);
      expect(unused).toBe(10);
    });

    it("cada código tiene el formato XXXXX-XXXXX (alfabeto sin 0/O/1/I/L)", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);
      const re = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
      for (const code of codes) {
        expect(code).toMatch(re);
      }
    });

    it("SEGURIDAD: persiste solo el HASH sha256, nunca el código en claro", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);

      const rows = await prisma.adminRecoveryCode.findMany({
        where: { adminUserId: adminId },
        select: { codeHash: true },
      });
      const storedHashes = rows.map((r) => r.codeHash);

      // Ningún valor almacenado coincide con un código en claro (ni con/sin guion).
      for (const code of codes) {
        expect(storedHashes).not.toContain(code);
        expect(storedHashes).not.toContain(code.replace("-", ""));
      }
      // Y cada código en claro tiene su hash correspondiente almacenado.
      for (const code of codes) {
        expect(storedHashes).toContain(expectedHash(code));
      }
      // Los hashes son hex de 64 chars (sha256).
      for (const h of storedHashes) {
        expect(h).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it("genera 10 códigos en claro distintos entre sí (sin colisiones obvias)", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);
      expect(new Set(codes).size).toBe(10);
    });

    it("regenerar BORRA los códigos anteriores y crea 10 nuevos", async () => {
      const adminId = await makeAdmin();
      const first = await generateRecoveryCodes(adminId);
      const firstHashes = first.map(expectedHash);

      const second = await generateRecoveryCodes(adminId);

      const total = await prisma.adminRecoveryCode.count({ where: { adminUserId: adminId } });
      expect(total).toBe(10); // no se acumulan (10, no 20)

      // Ninguno de los hashes viejos sobrevive (salvo colisión astronómicamente
      // improbable; los sets de claro son disjuntos en la práctica).
      const rows = await prisma.adminRecoveryCode.findMany({
        where: { adminUserId: adminId },
        select: { codeHash: true },
      });
      const currentHashes = new Set(rows.map((r) => r.codeHash));
      const survivors = firstHashes.filter((h) => currentHashes.has(h) && !second.map(expectedHash).includes(h));
      expect(survivors).toEqual([]);
    });

    it("SEGURIDAD: regenerar descarta también los códigos YA USADOS (no quedan huérfanos)", async () => {
      const adminId = await makeAdmin();
      const first = await generateRecoveryCodes(adminId);
      // Consumir uno → queda con usedAt seteado.
      const ok = await consumeRecoveryCode(adminId, first[0]);
      expect(ok).toBe(true);

      // Regenerar.
      await generateRecoveryCodes(adminId);

      // No debe quedar ningún código usado del lote anterior.
      const used = await prisma.adminRecoveryCode.count({
        where: { adminUserId: adminId, usedAt: { not: null } },
      });
      expect(used).toBe(0);
      const total = await prisma.adminRecoveryCode.count({ where: { adminUserId: adminId } });
      expect(total).toBe(10);
    });

    it("aísla por admin: generar para A no afecta los códigos de B", async () => {
      const adminA = await makeAdmin();
      const adminB = await makeAdmin();
      await generateRecoveryCodes(adminA);
      await generateRecoveryCodes(adminB);

      // Regenerar A no debe tocar B.
      await generateRecoveryCodes(adminA);

      expect(await prisma.adminRecoveryCode.count({ where: { adminUserId: adminB } })).toBe(10);
      expect(await prisma.adminRecoveryCode.count({ where: { adminUserId: adminA } })).toBe(10);
    });
  });

  // ───────────────────────── countUnusedRecoveryCodes ─────────────────────────

  describe("countUnusedRecoveryCodes", () => {
    it("devuelve 0 cuando el admin nunca generó códigos", async () => {
      const adminId = await makeAdmin();
      expect(await countUnusedRecoveryCodes(adminId)).toBe(0);
    });

    it("devuelve 10 justo después de generar", async () => {
      const adminId = await makeAdmin();
      await generateRecoveryCodes(adminId);
      expect(await countUnusedRecoveryCodes(adminId)).toBe(10);
    });

    it("decrementa en 1 por cada código consumido", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);

      await consumeRecoveryCode(adminId, codes[0]);
      expect(await countUnusedRecoveryCodes(adminId)).toBe(9);

      await consumeRecoveryCode(adminId, codes[1]);
      await consumeRecoveryCode(adminId, codes[2]);
      expect(await countUnusedRecoveryCodes(adminId)).toBe(7);
    }, 30_000);

    it("llega a 0 al consumir los 10", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);
      for (const code of codes) {
        await consumeRecoveryCode(adminId, code);
      }
      expect(await countUnusedRecoveryCodes(adminId)).toBe(0);
    }, 30_000);

    it("no cuenta códigos de otro admin", async () => {
      const adminA = await makeAdmin();
      const adminB = await makeAdmin();
      await generateRecoveryCodes(adminA);
      // B no genera nada.
      expect(await countUnusedRecoveryCodes(adminB)).toBe(0);
      expect(await countUnusedRecoveryCodes(adminA)).toBe(10);
    });
  });

  // ───────────────────────── consumeRecoveryCode ─────────────────────────

  describe("consumeRecoveryCode", () => {
    it("acepta un código válido sin usar y devuelve true", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);
      expect(await consumeRecoveryCode(adminId, codes[0])).toBe(true);
    });

    it("marca usedAt al consumir (deja rastro de cuándo se usó)", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);
      const before = new Date();
      await consumeRecoveryCode(adminId, codes[0]);

      const row = await prisma.adminRecoveryCode.findFirst({
        where: { adminUserId: adminId, codeHash: expectedHash(codes[0]) },
        select: { usedAt: true },
      });
      expect(row?.usedAt).toBeInstanceOf(Date);
      expect(row!.usedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    });

    it("SEGURIDAD: un código es de un solo uso — la segunda vez devuelve false", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);

      expect(await consumeRecoveryCode(adminId, codes[0])).toBe(true);
      expect(await consumeRecoveryCode(adminId, codes[0])).toBe(false);
      // Y un segundo intento más sigue siendo false (idempotente en el fallo).
      expect(await consumeRecoveryCode(adminId, codes[0])).toBe(false);
    });

    it("SEGURIDAD: un código inexistente/inválido devuelve false", async () => {
      const adminId = await makeAdmin();
      await generateRecoveryCodes(adminId);
      // Código bien formado pero que no fue generado para este admin.
      expect(await consumeRecoveryCode(adminId, "ZZZZZ-ZZZZZ")).toBe(false);
    });

    it("string vacío devuelve false (no consume nada)", async () => {
      const adminId = await makeAdmin();
      await generateRecoveryCodes(adminId);
      expect(await consumeRecoveryCode(adminId, "")).toBe(false);
      expect(await countUnusedRecoveryCodes(adminId)).toBe(10);
    });

    it("acepta el código con normalización: minúsculas y sin guion son equivalentes", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);
      // El mismo código en minúsculas y sin el separador debe validar (normalize).
      const messy = codes[0].toLowerCase().replace("-", "");
      expect(await consumeRecoveryCode(adminId, messy)).toBe(true);
    });

    it("acepta el código con espacios y separadores extra (se normalizan)", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);
      const raw = codes[0].replace("-", "");
      const messy = ` ${raw.slice(0, 5)} . ${raw.slice(5)} `;
      expect(await consumeRecoveryCode(adminId, messy)).toBe(true);
    });

    it("SEGURIDAD: aislamiento por admin — A no puede consumir un código de B", async () => {
      const adminA = await makeAdmin();
      const adminB = await makeAdmin();
      const codesB = await generateRecoveryCodes(adminB);
      await generateRecoveryCodes(adminA);

      // A intenta usar un código de B → false, y el de B sigue sin usar.
      expect(await consumeRecoveryCode(adminA, codesB[0])).toBe(false);
      expect(await countUnusedRecoveryCodes(adminB)).toBe(10);
      // B sí puede usarlo.
      expect(await consumeRecoveryCode(adminB, codesB[0])).toBe(true);
    });

    it("devuelve false para un adminUserId que no existe (sin lanzar)", async () => {
      expect(await consumeRecoveryCode("ckxxxxxxxxxxxxxxxxxxxxxxx", "ABCDE-FGHJK")).toBe(false);
    });

    it("consumir el código N no afecta a los demás (solo se marca el correcto)", async () => {
      const adminId = await makeAdmin();
      const codes = await generateRecoveryCodes(adminId);
      await consumeRecoveryCode(adminId, codes[3]);

      // El resto sigue consumible.
      expect(await consumeRecoveryCode(adminId, codes[0])).toBe(true);
      expect(await consumeRecoveryCode(adminId, codes[9])).toBe(true);
      // Exactamente 3 usados, 7 libres.
      expect(await countUnusedRecoveryCodes(adminId)).toBe(7);
    }, 30_000);
  });
});
