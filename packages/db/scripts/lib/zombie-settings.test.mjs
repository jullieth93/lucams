/*
 * Test del registro de settings zombi (lib/zombie-settings.mjs) — corre con
 * `node --test`. Lo crítico: la lista es exactamente la aprobada en N-10 y
 * NINGUNA de sus keys puede volver a cms-site-map.mjs (si alguien la
 * re-agrega al site map, migrate-cms-v2 la resembraría tras la purga — este
 * test lo impide).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ZOMBIE_SETTING_KEYS } from "./zombie-settings.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("ZOMBIE_SETTING_KEYS", () => {
  it("es exactamente la lista aprobada (15 keys — la auditoría decía ~14; el conteo real en DB lo reporta el script)", () => {
    assert.deepEqual(
      [...ZOMBIE_SETTING_KEYS].sort(),
      [
        "BUSINESS_LEGAL_NAME",
        "DPA_AVEONLINE_URL",
        "DPA_CLOUDFLARE_URL",
        "DPA_GOOGLE_URL",
        "DPA_RESEND_URL",
        "DPA_SUPABASE_URL",
        "DPA_VERCEL_URL",
        "DPA_WOMPI_URL",
        "HABEAS_DATA_CLAIM_DAYS",
        "HABEAS_DATA_CONSULTATION_DAYS",
        "MANUFACTURING_DAYS_RANGE",
        "RETRACTION_DAYS_BUSINESS",
        "SITE_DESCRIPTION",
        "SITE_TAGLINE",
        "WARRANTY_DURATION_YEARS",
      ],
    );
  });

  it("sin duplicados y formato UPPER_SNAKE", () => {
    assert.equal(new Set(ZOMBIE_SETTING_KEYS).size, ZOMBIE_SETTING_KEYS.length);
    for (const k of ZOMBIE_SETTING_KEYS) assert.match(k, /^[A-Z][A-Z0-9_]+$/);
  });

  it("ninguna key zombi está inline en cms-site-map.mjs (no se resiembran vía migrate-cms-v2)", () => {
    const siteMap = readFileSync(join(HERE, "..", "cms-site-map.mjs"), "utf-8");
    for (const k of ZOMBIE_SETTING_KEYS) {
      assert.ok(
        !siteMap.includes(`"${k}"`),
        `${k} aparece en cms-site-map.mjs — migrate-cms-v2 la resembraría tras la purga`,
      );
    }
  });
});
