// P5g1 — Testes dos helpers de multi-output (puros). normalizeResultUrls
// (contrato GenStatus) + getGenerationResultUrls (leitura na UI). Runner-agnóstico.

import { normalizeResultUrls, getGenerationResultUrls } from "./result-urls";
import { test } from "vitest";

test("result-urls.test.ts", async () => {

const fails: string[] = [];
const chk = (n: string, c: boolean): void => { if (!c) fails.push(n); };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

void (() => {
  // ── normalizeResultUrls ─────────────────────────────────────────────────────
  chk("single scalar → [a]", eq(normalizeResultUrls({ resultUrl: "a" }), ["a"]));
  chk("nada → []", eq(normalizeResultUrls({}), []));
  chk("multi → ordem preservada", eq(
    normalizeResultUrls({ resultUrl: "a", resultUrls: ["a", "b", "c", "d"] }),
    ["a", "b", "c", "d"]
  ));
  chk("mismatched → primary + array", eq(
    normalizeResultUrls({ resultUrl: "a", resultUrls: ["b", "c"] }),
    ["a", "b", "c"]
  ));
  chk("duplicatas removidas (1ª ocorrência)", eq(
    normalizeResultUrls({ resultUrl: "a", resultUrls: ["a", "b", "a", "c", "b"] }),
    ["a", "b", "c"]
  ));
  chk("vazios/whitespace removidos", eq(
    normalizeResultUrls({ resultUrl: "", resultUrls: ["  ", "b", ""] }),
    ["b"]
  ));
  chk("só array (sem scalar)", eq(
    normalizeResultUrls({ resultUrls: ["x", "y"] }),
    ["x", "y"]
  ));
  chk("não inventa URL (null/undefined)", eq(
    normalizeResultUrls({ resultUrl: null, resultUrls: null }),
    []
  ));

  // ── getGenerationResultUrls (UI) ────────────────────────────────────────────
  chk("legacy: só result_url → [a]", eq(
    getGenerationResultUrls({ result_url: "a", params: {} }),
    ["a"]
  ));
  chk("legacy: params null → [a]", eq(
    getGenerationResultUrls({ result_url: "a", params: null }),
    ["a"]
  ));
  chk("multi: params.result_urls (4)", eq(
    getGenerationResultUrls({ result_url: "a", params: { result_urls: ["a", "b", "c", "d"] } }),
    ["a", "b", "c", "d"]
  ));
  chk("multi vazio → fallback result_url", eq(
    getGenerationResultUrls({ result_url: "a", params: { result_urls: [] } }),
    ["a"]
  ));
  chk("malformed params.result_urls (não-array) → fallback", eq(
    getGenerationResultUrls({ result_url: "a", params: { result_urls: "nope" as unknown as string[] } }),
    ["a"]
  ));
  chk("malformed: itens não-string filtrados", eq(
    getGenerationResultUrls({ result_url: "a", params: { result_urls: ["x", 5 as unknown as string, "y"] } }),
    ["x", "y"]
  ));
  chk("nada → []", eq(
    getGenerationResultUrls({ result_url: null, params: {} }),
    []
  ));

  if (fails.length > 0) throw new Error("result-urls.test falhou: " + fails.join(", "));
  console.log("result-urls.test: OK (todas as assertivas passaram)");
})();
});
