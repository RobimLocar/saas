// Prova que reembolso, contestação e alerta de fraude chamam o estorno de
// créditos certo (compra certa, fração certa, bloqueio certo) — sem Stripe nem
// banco reais. A matemática do estorno no banco é provada em scripts/db-verify.
import { describe, it, expect, vi, beforeEach } from "vitest";

const g = globalThis as unknown as {
  __charges: Record<string, Record<string, unknown>>;
  __sessionsByPi: Record<string, { id: string; mode: string }>;
  __invoiceByPi: Record<string, string>;
};
g.__charges = {};
g.__sessionsByPi = {};
g.__invoiceByPi = {};

vi.mock("@/lib/stripe/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe/client")>();
  return {
    ...actual,
    stripe: {
      charges: { retrieve: async (id: string) => g.__charges[id] },
      checkout: {
        sessions: {
          list: async ({ payment_intent }: { payment_intent: string }) => ({
            data: g.__sessionsByPi[payment_intent] ? [g.__sessionsByPi[payment_intent]] : [],
          }),
        },
      },
      invoicePayments: {
        list: async ({ payment }: { payment: { payment_intent: string } }) => ({
          data: g.__invoiceByPi[payment.payment_intent] ? [{ invoice: g.__invoiceByPi[payment.payment_intent] }] : [],
        }),
      },
    },
  };
});

import { processEvent } from "./webhook-processor";

type Rpc = { name: string; args: Record<string, unknown> };
function makeSupabase(rpcResult = "APPLIED:200:50") {
  const rpcs: Rpc[] = [];
  const updates: Array<{ table: string; patch: Record<string, unknown>; col: string; val: unknown }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      return { data: rpcResult, error: null };
    },
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (col: string, val: unknown) => {
          updates.push({ table, patch, col, val });
          return { error: null };
        },
      }),
    }),
  };
  return { client: client as never, rpcs, updates };
}

const ev = (type: string, object: unknown) => ({ id: `evt_${type}`, type, data: { object } });

describe("webhook: estorno de créditos", () => {
  beforeEach(() => {
    g.__charges = {};
    g.__sessionsByPi = {};
    g.__invoiceByPi = {};
  });

  it("reembolso total de recarga estorna 100% da compra, sem bloquear", async () => {
    g.__sessionsByPi.pi_1 = { id: "cs_1", mode: "payment" };
    const { client, rpcs } = makeSupabase();
    await processEvent(client, ev("charge.refunded", { id: "ch_1", amount: 3990, amount_refunded: 3990, payment_intent: "pi_1", customer: "cus_1" }));
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].name).toBe("reverse_purchase_credits");
    expect(rpcs[0].args).toMatchObject({ p_grant_external_id: "stripe:checkout:cs_1", p_fraction: 1, p_hold: false });
    expect(rpcs[0].args.p_key).toBe("refund:ch_1:3990");
  });

  it("reembolso parcial usa a fração reembolsada", async () => {
    g.__sessionsByPi.pi_2 = { id: "cs_2", mode: "payment" };
    const { client, rpcs } = makeSupabase();
    await processEvent(client, ev("charge.refunded", { id: "ch_2", amount: 1000, amount_refunded: 250, payment_intent: "pi_2" }));
    expect(rpcs[0].args.p_fraction).toBeCloseTo(0.25);
  });

  it("reembolso de assinatura acha a fatura pelo campo antigo charge.invoice", async () => {
    const { client, rpcs } = makeSupabase();
    await processEvent(client, ev("charge.refunded", { id: "ch_3", amount: 9700, amount_refunded: 9700, invoice: "in_9", payment_intent: "pi_3" }));
    expect(rpcs[0].args.p_grant_external_id).toBe("stripe:invoice:in_9");
  });

  it("assinatura no formato novo (sem charge.invoice) acha a fatura via invoicePayments", async () => {
    g.__invoiceByPi.pi_4 = "in_4";
    const { client, rpcs } = makeSupabase();
    await processEvent(client, ev("charge.refunded", { id: "ch_4", amount: 9700, amount_refunded: 9700, payment_intent: "pi_4" }));
    expect(rpcs[0].args.p_grant_external_id).toBe("stripe:invoice:in_4");
  });

  it("contestação estorna tudo e bloqueia a conta", async () => {
    g.__charges.ch_5 = { id: "ch_5", amount: 799, payment_intent: "pi_5", customer: "cus_5" };
    g.__sessionsByPi.pi_5 = { id: "cs_5", mode: "payment" };
    const { client, rpcs } = makeSupabase();
    await processEvent(client, ev("charge.dispute.created", { id: "dp_5", charge: "ch_5" }));
    expect(rpcs[0].args).toMatchObject({
      p_grant_external_id: "stripe:checkout:cs_5",
      p_key: "dispute:dp_5",
      p_fraction: 1,
      p_hold: true,
      p_hold_reason: "dispute",
    });
  });

  it("contestação ganha devolve os créditos daquela contestação", async () => {
    g.__charges.ch_6 = { id: "ch_6", payment_intent: "pi_6" };
    g.__sessionsByPi.pi_6 = { id: "cs_6", mode: "payment" };
    const { client, rpcs } = makeSupabase();
    await processEvent(client, ev("charge.dispute.closed", { id: "dp_6", charge: "ch_6", status: "won" }));
    expect(rpcs[0].name).toBe("reinstate_dispute_credits");
    expect(rpcs[0].args).toMatchObject({ p_grant_external_id: "stripe:checkout:cs_6", p_dispute_key: "dispute:dp_6" });
  });

  it("contestação perdida não devolve nada e mantém o bloqueio", async () => {
    g.__charges.ch_7 = { id: "ch_7", payment_intent: "pi_7" };
    const { client, rpcs } = makeSupabase();
    await processEvent(client, ev("charge.dispute.closed", { id: "dp_7", charge: "ch_7", status: "lost" }));
    expect(rpcs).toHaveLength(0);
  });

  it("alerta de fraude do Radar estorna tudo e bloqueia", async () => {
    g.__charges.ch_8 = { id: "ch_8", payment_intent: "pi_8", customer: "cus_8" };
    g.__sessionsByPi.pi_8 = { id: "cs_8", mode: "payment" };
    const { client, rpcs } = makeSupabase();
    await processEvent(client, ev("radar.early_fraud_warning.created", { id: "issfr_8", charge: "ch_8" }));
    expect(rpcs[0].args).toMatchObject({ p_key: "efw:issfr_8", p_hold: true, p_hold_reason: "early_fraud_warning" });
  });

  it("compra não encontrada numa contestação ainda bloqueia a conta pelo customer", async () => {
    g.__charges.ch_9 = { id: "ch_9", payment_intent: "pi_9", customer: "cus_9" };
    const { client, rpcs, updates } = makeSupabase();
    await processEvent(client, ev("charge.dispute.created", { id: "dp_9", charge: "ch_9" }));
    expect(rpcs).toHaveLength(0);
    expect(updates[0]).toMatchObject({ table: "profiles", col: "stripe_customer_id", val: "cus_9" });
    expect(updates[0].patch.billing_hold).toBe(true);
  });

  it("erro no banco propaga para o Stripe reenviar o evento", async () => {
    g.__sessionsByPi.pi_10 = { id: "cs_10", mode: "payment" };
    const client = {
      rpc: async () => ({ data: null, error: { message: "db down" } }),
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    } as never;
    await expect(
      processEvent(client, ev("charge.refunded", { id: "ch_10", amount: 100, amount_refunded: 100, payment_intent: "pi_10" }))
    ).rejects.toThrow(/reverse_purchase_credits falhou/);
  });
});
