import { defineConfig } from "vitest/config";
import path from "node:path";

// Runner mínimo e determinístico para os testes "runner-agnostic" já
// existentes no repo (assertivas rodam no import/top-level, lançam em caso de
// falha) e para os que precisam de módulo mockado (vi.mock). Não introduz
// nenhum framework de asserção novo — os testes continuam com seus próprios
// `check()`/`throw` internos; o vitest só provê: resolução de "@/..." (mesmo
// alias do tsconfig), vi.mock, e um comando único e repetível (`npm test`).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
