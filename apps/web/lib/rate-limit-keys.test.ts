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
  it("builds consistent key format scope:ip:<address>", () => {
    expect(ipKey("login", "1.2.3.4")).toBe("login:ip:1.2.3.4");
    expect(ipKey("signup", "::1")).toBe("signup:ip:::1");
  });
});

describe("emailKey", () => {
  it("scope:email:<hash> format with truncated sha256", () => {
    const k = emailKey("login", "lucy@example.com");
    expect(k).toMatch(/^login:email:[a-f0-9]{16}$/);
  });
});
