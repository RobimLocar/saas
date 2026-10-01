import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("aceita caminhos internos com query e hash", () => {
    expect(safeRedirectPath("/studio")).toBe("/studio");
    expect(safeRedirectPath("/pricing#recarga")).toBe("/pricing#recarga");
    expect(safeRedirectPath("/flows/abc?tab=1")).toBe("/flows/abc?tab=1");
  });

  it("recusa destinos externos e truques comuns", () => {
    for (const bad of [
      "https://site-falso.com",
      "//site-falso.com",
      "/\\site-falso.com",
      "javascript:alert(1)",
      "studio",
      "/%0d%0aSet-Cookie:x",
      "\t//site-falso.com",
      "",
      null,
      undefined,
      123,
    ]) {
      const out = safeRedirectPath(bad);
      expect(out.startsWith("/") && !out.startsWith("//")).toBe(true);
      expect(out).not.toContain("site-falso");
    }
  });

  it("usa o fallback informado", () => {
    expect(safeRedirectPath("https://x.com", "/login")).toBe("/login");
  });
});
