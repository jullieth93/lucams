import { describe, expect, it } from "vitest";
import { emailKey, hashEmail, ipKey } from "./rate-limit-keys";

describe("hashEmail", () => {
  it("returns same hash for same email", () => {
    expect(hashEmail("lucy@example.com")).toBe(hashEmail("lucy@example.com"));
  });

  it("normalizes case", () => {
    expect(hashEmail("Lucy@Example.com")).toBe(hashEmail("lucy@example.com"));
  });

  it("trims whitespace", () => {
    expect(hashEmail("  lucy@example.com  ")).toBe(hashEmail("lucy@example.com"));
  });

  it("returns 16-char hex prefix (sha256 truncated)", () => {
    const h = hashEmail("lucy@example.com");
    expect(h).toMatch(/^[a-f0-9]{16}$/);
  });

  it("produces different hashes for different emails", () => {
    expect(hashEmail("lucy@example.com")).not.toBe(hashEmail("ana@example.com"));
  });
});

describe("ipKey", () => {
  it("scope:ip:<hash> format — la IP es PII y va hasheada (auditoría experto 2026-07-26)", () => {
    // Determinístico (misma IP → mismo hash) para que el rate-limit por IP siga agrupando,
    // pero la IP nunca queda en claro en la key (Ley 1581/GDPR).
    const k1 = ipKey("login", "1.2.3.4");
    const k2 = ipKey("login", "1.2.3.4");
    const k3 = ipKey("login", "5.6.7.8");
    expect(k1).toBe(k2); // estable por IP
    expect(k1).not.toBe(k3); // distinto por IP distinta
    expect(k1).toMatch(/^login:ip:[0-9a-f]{16}$/); // formato scope:ip:<sha256 truncado>
    expect(k1).not.toContain("1.2.3.4"); // la IP nunca en claro
  });
});

describe("emailKey", () => {
  it("scope:email:<hash> format with truncated sha256", () => {
    const k = emailKey("login", "lucy@example.com");
    expect(k).toMatch(/^login:email:[a-f0-9]{16}$/);
  });
});
