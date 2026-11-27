import { describe, expect, it } from "vitest";
import { buildWeakEtag, isWildcardIfNoneMatch, matchesIfNoneMatch } from "./http-etag";

describe("http-etag (RFC 9110)", () => {
  it("genera un ETag débil determinista sin exponer el contenido original", () => {
    const a = buildWeakEtag(["design-preview", "design-123", "preview.png", 1700000000]);
    const b = buildWeakEtag(["design-preview", "design-123", "preview.png", 1700000000]);
    const c = buildWeakEtag(["design-preview", "design-123", "preview.png", 1700000001]);

    expect(a).toMatch(/^W\/"[a-f0-9]{24}"$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("design-123");
  });

  it("compara débilmente ETag exacto, forma fuerte sin W/ y listas separadas por coma", () => {
    const etag = 'W/"abcdef0123456789abcdef01"';
    expect(matchesIfNoneMatch(etag, etag)).toBe(true);
    expect(matchesIfNoneMatch('"abcdef0123456789abcdef01"', etag)).toBe(true);
    expect(matchesIfNoneMatch('"other-tag", W/"abcdef0123456789abcdef01", "third"', etag)).toBe(
      true,
    );
    expect(matchesIfNoneMatch('"other-tag", W/"different"', etag)).toBe(false);
    expect(matchesIfNoneMatch("malformed-without-quotes", etag)).toBe(false);
    expect(matchesIfNoneMatch(null, etag)).toBe(false);
  });

  it("trata wildcard '*' solo como valor único y cuando allowWildcard está habilitado (RFC 9110)", () => {
    const etag = 'W/"abcdef0123456789abcdef01"';
    expect(isWildcardIfNoneMatch(" * ")).toBe(true);
    expect(isWildcardIfNoneMatch(etag)).toBe(false);
    expect(matchesIfNoneMatch("*", etag)).toBe(false);
    expect(matchesIfNoneMatch("*", etag, { allowWildcard: true })).toBe(true);
    // RFC 9110 § 13.1.2: `*` nunca es válido dentro de una lista separada por comas.
    expect(matchesIfNoneMatch('"other", *', etag, { allowWildcard: true })).toBe(false);
    // RFC 9110 § 8.8.3: `W/` es case-sensitive y no admite espacio antes de la comilla.
    expect(matchesIfNoneMatch('w/"abcdef0123456789abcdef01"', etag)).toBe(false);
    expect(matchesIfNoneMatch('W/ "abcdef0123456789abcdef01"', etag)).toBe(false);
    expect(matchesIfNoneMatch('"ab"cd"', etag)).toBe(false);
  });
});
