// P7a — Testes do webhook Stripe (grant idempotency + payment truth).
// Runner-agnóstico e SEM Stripe/DB reais: injetamos um mock de Supabase in-memory
// direto em `processEvent(supabase, event)` (o supabase é PARÂMETRO), então estes
// casos NÃO tocam rede. Cobrem: linkage de checkout(subscription) sem grant,
// verdade de pagamento do top-up (paid/unpaid/pack/valor/moeda/idempotência de
// sessão) e o mapeamento price_id→plano. Os cenários que dependem do
// `stripe.subscriptions.retrieve` (grant por fatura, recuperação de claim, dedupe
// fail-closed) são validados no harness esbuild externo (ver relatório P7a).

import { processEvent, planFromPriceId } from "@/lib/stripe/webhook-processor";
import { test } from "vitest";

test("webhook-processor.test.ts", async () => {

const failures: string[] = [];

// ── Mock Supabase in-memory (suporta as chamadas exatas do webhook) ──────────
type Row = Record<string, unknown>;
function makeDb(seed: { profiles?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    profiles: [...(seed.profiles ?? [])],
    stripe_events: [],
    credit_transactions: [],
    credit_purchases: [],
  };
  const uniques: Record<string, string> = {
    stripe_events: "event_id",
    credit_purchases: "stripe_session_id",
  };
  function from(name: string) {
    const b: {
      _mode: string | null;
      _payload: Row | null;
      _filters: Array<[string, unknown]>;
      insert: (row: Row) => Promise<{ error: unknown }>;
      select: (c?: string) => typeof b;
      update: (p: Row) => typeof b;
      delete: () => typeof b;
      eq: (c: string, v: unknown) => typeof b;
      single: () => Promise<{ data: Row | null; error: unknown }>;
      maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>;
    } = {
      _mode: null,
      _payload: null,
      _filters: [],
      insert: (row: Row) => {
        const u = uniques[name];
        if (u && tables[name].some((r) => r[u] === row[u])) {
          return Promise.resolve({ error: { code: "23505", message: "dup" } });
        }
        tables[name].push({ ...row });
        return Promise.resolve({ error: null });
      },
      select() {
        b._mode = "select";
        return b;
      },
      update(p: Row) {
        b._mode = "update";
        b._payload = p;
        return b;
      },
      delete() {
        b._mode = "delete";
        return b;
      },
      eq(c: string, v: unknown) {
        b._filters.push([c, v]);
        return b;
      },
      single() {
        const row = tables[name].find((r) => b._filters.every(([c, v]) => r[c] === v));
        return Promise.resolve({ data: row ? { ...row } : null, error: row ? null : { message: "not found" } });
      },
      maybeSingle() {
        return b.single();
      },
      then(res, rej) {
        const match = (r: Row) => b._filters.every(([c, v]) => r[c] === v);
        if (b._mode === "update") {
          tables[name].forEach((r) => {
            if (match(r)) Object.assign(r, b._payload);
          });
          return Promise.resolve({ error: null }).then(res, rej);
        }
        if (b._mode === "delete") {
          for (let i = tables[name].length - 1; i >= 0; i--) if (match(tables[name][i])) tables[name].splice(i, 1);
          return Promise.resolve({ error: null }).then(res, rej);
        }
        if (b._mode === "select") {
          return Promise.resolve({ data: tables[name].filter(match), error: null }).then(res, rej);
        }
        return Promise.resolve({ error: null }).then(res, rej);
      },
    };
    return b;
  }
  // P7b — mock das RPCs atômicas (mesma semântica das funções Postgres): idempotência
  // por sessão (topup) / por external_id (subscription); incremento de saldo.
  async function rpc(name: string, args: Record<string, unknown>) {
    if (name === "grant_topup_credits") {
      const sid = args.p_session_id as string;
      if (tables.credit_purchases.some((p) => p.stripe_session_id === sid)) {
        return { data: "ALREADY_APPLIED", error: null };
      }
      const credits = args.p_credits as number;
      const uid = args.p_user_id as string;
      tables.credit_purchases.push({ stripe_session_id: sid, credits, user_id: uid });
      tables.credit_transactions.push({ user_id: uid, amount: credits, reason: "topup", external_id: `stripe:checkout:${sid}` });
      const prof = tables.profiles.find((p) => p.id === uid);
      if (prof) prof.credits_balance = (prof.credits_balance as number) + credits;
      return { data: `APPLIED:${prof?.credits_balance ?? 0}`, error: null };
    }
    if (name === "grant_subscription_credits") {
      const ext = args.p_external_id as string;
      if (tables.credit_transactions.some((t) => t.external_id === ext)) {
        return { data: "ALREADY_APPLIED", error: null };
      }
      const credits = args.p_credits as number;
      const uid = args.p_user_id as string;
      tables.credit_transactions.push({ user_id: uid, amount: credits, reason: "subscription", external_id: ext });
      const prof = tables.profiles.find((p) => p.id === uid);
      if (prof) {
        prof.credits_balance = (prof.credits_balance as number) + credits;
        prof.plan = args.p_plan;
        prof.plan_credits_monthly = credits;
      }
      return { data: `APPLIED:${prof?.credits_balance ?? 0}`, error: null };
    }
    return { data: null, error: { message: `unknown rpc ${name}` } };
  }
  return { client: { from, rpc } as unknown as Parameters<typeof processEvent>[0], tables };
}

const check = (name: string, cond: boolean): void => {
  if (!cond) failures.push(name);
};
const profile = (): Row => ({ id: "u1", credits_balance: 50, plan: "free", plan_credits_monthly: 0, stripe_customer_id: "cus_1" });
const bal = (t: Record<string, Row[]>) => (t.profiles.find((p) => p.id === "u1") || {}).credits_balance;
const topupGrants = (t: Record<string, Row[]>) => t.credit_transactions.filter((x) => x.reason === "topup").length;
const subGrants = (t: Record<string, Row[]>) => t.credit_transactions.filter((x) => x.reason === "subscription").length;

const coTopup = (id: string, x: { sid?: string; ps?: string; cur?: string; amt?: number; pack?: string }, evType = "checkout.session.completed") => ({
  id,
  type: evType,
  data: {
    object: {
      id: x.sid ?? "cs_1",
      mode: "payment",
      payment_status: x.ps,
      currency: x.cur,
      amount_total: x.amt,
      metadata: { type: "topup", userId: "u1", pack_id: x.pack },
    },
  },
});

async function runStripeWebhookTests(): Promise<string[]> {
  // planFromPriceId (pure)
  check("planFromPriceId unknown → null", planFromPriceId("price_UNKNOWN") === null);
  check("planFromPriceId empty → null", planFromPriceId(undefined) === null);

  // checkout(subscription) → 0 credit grant, apenas linkage de plano
  {
    const { client, tables } = makeDb({ profiles: [profile()] });
    await processEvent(client, {
      id: "ev_co",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", customer: "cus_1", metadata: { type: "subscription", userId: "u1", plan: "starter" } } },
    });
    check("checkout(sub) → 0 credit grant", subGrants(tables) === 0 && bal(tables) === 50);
    check("checkout(sub) → plano vinculado", tables.profiles[0].plan === "starter");
  }

  // top-up paid → +200 uma vez
  {
    const { client, tables } = makeDb({ profiles: [profile()] });
    await processEvent(client, coTopup("ev_tp", { ps: "paid", cur: "usd", amt: 799, pack: "pack_100" }));
    check("topup paid → +200 uma vez", bal(tables) === 250 && topupGrants(tables) === 1);
  }
  // top-up unpaid → 0
  {
    const { client, tables } = makeDb({ profiles: [profile()] });
    await processEvent(client, coTopup("ev_tu", { ps: "unpaid", cur: "usd", amt: 799, pack: "pack_100" }));
    check("topup unpaid → 0", bal(tables) === 50 && topupGrants(tables) === 0);
  }
  // top-up unknown pack → 0
  {
    const { client, tables } = makeDb({ profiles: [profile()] });
    await processEvent(client, coTopup("ev_up", { ps: "paid", cur: "usd", amt: 799, pack: "pack_FAKE" }));
    check("topup pack desconhecido → 0", topupGrants(tables) === 0 && bal(tables) === 50);
  }
  // top-up amount mismatch → 0
  {
    const { client, tables } = makeDb({ profiles: [profile()] });
    await processEvent(client, coTopup("ev_am", { ps: "paid", cur: "usd", amt: 1, pack: "pack_100" }));
    check("topup valor divergente → 0", topupGrants(tables) === 0 && bal(tables) === 50);
  }
  // top-up currency mismatch → 0
  {
    const { client, tables } = makeDb({ profiles: [profile()] });
    await processEvent(client, coTopup("ev_cm", { ps: "paid", cur: "brl", amt: 799, pack: "pack_100" }));
    check("topup moeda divergente → 0", topupGrants(tables) === 0 && bal(tables) === 50);
  }
  // top-up sessão duplicada (completed + async_succeeded, MESMA sessão) → 1 grant
  {
    const { client, tables } = makeDb({ profiles: [profile()] });
    await processEvent(client, coTopup("ev_t1", { sid: "cs_X", ps: "paid", cur: "usd", amt: 799, pack: "pack_100" }));
    await processEvent(client, coTopup("ev_t2", { sid: "cs_X", ps: "paid", cur: "usd", amt: 799, pack: "pack_100" }, "checkout.session.async_payment_succeeded"));
    check("topup sessão duplicada (2 eventos) → 1 grant", topupGrants(tables) === 1 && bal(tables) === 250);
  }
  // async_payment_succeeded sozinho (paid) → +500
  {
    const { client, tables } = makeDb({ profiles: [profile()] });
    await processEvent(client, coTopup("ev_async", { sid: "cs_A", ps: "paid", cur: "usd", amt: 1799, pack: "pack_250" }, "checkout.session.async_payment_succeeded"));
    check("async paid → +500 uma vez", bal(tables) === 550 && topupGrants(tables) === 1);
  }

  return failures;
}

void runStripeWebhookTests().then((f) => {
  if (f.length > 0) {
    const msg = `webhook-processor.test falhou:\n - ${f.join("\n - ")}`;
    console.error(msg);
    process.exitCode = 1;
    throw new Error(msg);
  } else {
    console.log("webhook-processor.test: OK (todas as assertivas passaram)");
  }
});
});
