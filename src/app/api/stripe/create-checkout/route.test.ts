// PROFILES-STRIPE-CUSTOMER-PARITY-01 — regressão para o fix de
// stripe_customer_id via service role.
//
// Prova exatamente o gap encontrado ao vivo no Preview: `profiles` só tem a
// policy `profiles_select_own` (SELECT). Um `.update()` feito com o client
// authenticated (cookie/anon-key) seria filtrado pelo RLS e viraria um no-op
// SILENCIOSO (0 linhas afetadas, sem erro) — o customer novo nunca seria
// persistido, e todo checkout futuro criaria outro Stripe customer.
//
// Este teste NÃO simula RLS real (não há Postgres aqui) — em vez disso prova
// o contrato de código que evita depender dela: a rota deve escrever
// stripe_customer_id através do client de SERVICE ROLE, nunca do client
// authenticated. Runner-agnóstico, sem rede real (Stripe/Supabase mockados).

import { vi, test } from "vitest";

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  eqCol: string;
  eqVal: unknown;
}
interface G {
  __authClientUpdates?: UpdateCall[];
  __serviceClientUpdates?: UpdateCall[];
  __stripeCustomersCreated?: Array<{ email?: string; metadata?: Record<string, unknown> }>;
  __profile?: { stripe_customer_id: string | null; plan: string };
}
const g = globalThis as unknown as G;

function profileQuery() {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    single: async () => ({ data: g.__profile ?? null, error: null }),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "user1@test.dev" } } }) },
    from: (table: string) => ({
      ...profileQuery(),
      update: (patch: Record<string, unknown>) => ({
        eq: async (eqCol: string, eqVal: unknown) => {
          (g.__authClientUpdates ??= []).push({ table, patch, eqCol, eqVal });
          return { data: null, error: null };
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (eqCol: string, eqVal: unknown) => {
          (g.__serviceClientUpdates ??= []).push({ table, patch, eqCol, eqVal });
          return { data: null, error: null };
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    customers: {
      create: async (args: { email?: string; metadata?: Record<string, unknown> }) => {
        (g.__stripeCustomersCreated ??= []).push(args);
        return { id: "cus_test_new" };
      },
    },
    checkout: {
      sessions: {
        create: async () => ({ url: "https://checkout.stripe.test/session" }),
      },
    },
  },
  PLANS: {
    starter: { name: "Starter", price_monthly: 1900, credits: 1000, stripe_price_id: "price_starter" },
  },
  TOPUP_PACKS: [{ id: "pack_100", credits: 200, price: 799, stripe_price_id: "price_pack_100" }],
}));

import { POST } from "./route";

test("create-checkout route.test.ts", async () => {

const fails: string[] = [];
const chk = (name: string, cond: boolean): void => { if (!cond) fails.push(name); };
const reset = (): void => {
  g.__authClientUpdates = [];
  g.__serviceClientUpdates = [];
  g.__stripeCustomersCreated = [];
};
function makeReq(body: unknown): Parameters<typeof POST>[0] {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0];
}

// ── NEW CUSTOMER: stripe_customer_id deve ser gravado via SERVICE ROLE ─────
reset();
g.__profile = { stripe_customer_id: null, plan: "free" };
const res1 = await POST(makeReq({ plan: "starter" }));
const body1 = (await res1.json()) as Record<string, unknown>;
chk("status 200", res1.status === 200);
chk("retorna session url", body1.url === "https://checkout.stripe.test/session");
chk("Stripe customer criado 1x", (g.__stripeCustomersCreated ?? []).length === 1);
chk("customer criado com email do usuário", g.__stripeCustomersCreated?.[0]?.email === "user1@test.dev");

const svcUpdates = g.__serviceClientUpdates ?? [];
chk("service role gravou stripe_customer_id 1x", svcUpdates.length === 1);
chk("update na tabela profiles", svcUpdates[0]?.table === "profiles");
chk("grava o customer id retornado pelo Stripe", svcUpdates[0]?.patch.stripe_customer_id === "cus_test_new");
chk("filtra pelo id do usuário autenticado", svcUpdates[0]?.eqVal === "user-1");

// A prova central da regressão: o client AUTHENTICATED nunca deve receber um
// update de profiles para este write (seria um no-op silencioso sob RLS real,
// já que só existe profiles_select_own).
chk(
  "client authenticated NUNCA escreve stripe_customer_id em profiles",
  (g.__authClientUpdates ?? []).filter((u) => u.table === "profiles" && "stripe_customer_id" in u.patch).length === 0
);

// ── CUSTOMER JÁ EXISTENTE: não deve criar novo nem escrever de novo ────────
reset();
g.__profile = { stripe_customer_id: "cus_existing", plan: "free" };
const res2 = await POST(makeReq({ plan: "starter" }));
chk("status 200 (customer existente)", res2.status === 200);
chk("Stripe customer NÃO recriado", (g.__stripeCustomersCreated ?? []).length === 0);
chk("nenhum update de profiles disparado", (g.__serviceClientUpdates ?? []).length === 0 && (g.__authClientUpdates ?? []).length === 0);

if (fails.length > 0) {
  throw new Error("create-checkout route.test falhou: " + fails.join(", "));
}
console.log("create-checkout route.test: OK (todas as assertivas passaram)");
});
