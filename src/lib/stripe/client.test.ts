// Prova o lazy-init do Stripe client (client.ts):
//  A) importar o módulo sem STRIPE_SECRET_KEY não quebra o import/build.
//  B) a primeira operação real sem secret falha explicitamente (fail-closed,
//     sem fallback silencioso que permitiria checkout sem config).
//  C) com uma chave sintaticamente válida de teste, o client constrói sem
//     nenhuma chamada de rede (o SDK do Stripe só faz I/O quando um método de
//     API é invocado, não na construção).
// Zero Stripe real: nenhuma chave de produção, nenhuma chamada HTTP.
import { describe, it, expect, beforeEach, afterAll } from "vitest";

const ORIGINAL_KEY = process.env.STRIPE_SECRET_KEY;

describe("stripe/client lazy init", () => {
  beforeEach(async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ORIGINAL_KEY;
  });

  it("A) import sem STRIPE_SECRET_KEY não quebra o import", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(import("./client")).resolves.toBeDefined();
  });

  it("B) primeira operação real sem secret falha de forma explícita (fail-closed)", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { stripe } = await import("./client");
    expect(() => stripe.customers).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("C) com chave sintaticamente válida de teste, constrói sem chamada de rede", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_0000000000000000000000000000000000000000000000";
    const { stripe } = await import("./client");
    expect(() => stripe.customers).not.toThrow();
    expect(typeof stripe.customers.create).toBe("function");
  });
});
